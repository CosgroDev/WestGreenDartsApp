// Runs the production application against an isolated PostgreSQL-compatible test DB.
// The REST adapter implements only the reads/RPCs used here; no live data is touched.
import { PGlite } from '@electric-sql/pglite';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID, createHmac } from 'node:crypto';
import assert from 'node:assert/strict';

const db = new PGlite(), team=randomUUID(), player=randomUUID(), season=randomUUID(), fixture=randomUUID();
const game=randomUUID(), practice=randomUUID(), practiceGame=randomUUID();
const session121=randomUUID(), bogey121=randomUUID(), anyBase121=randomUUID(), final121=randomUUID();
const secret=randomUUID(), key='performance-test-service-key', trace=[];
mkdirSync('performance-verification',{recursive:true});
await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
await db.exec(readFileSync('supabase/schema.sql','utf8'));
for (const folder of readdirSync('supabase/migrations',{withFileTypes:true}).filter(x=>x.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name))) {
  for (const file of readdirSync('supabase/migrations/'+folder.name).sort()) {
    if (file.endsWith('.sql')) await db.exec(readFileSync('supabase/migrations/'+folder.name+'/'+file,'utf8'));
  }
}
for (const file of ['20260908193204_audit_scoring_and_access_fixes.sql','20261001090000_scoring_snapshots.sql']) {
  await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
}
await db.query('insert into teams(id,name) values($1,$2)',[team,'West Green test']);
await db.query('insert into players(id,team_id,name) values($1,$2,$3)',[player,team,'Test Player']);
await db.query('insert into seasons(id,team_id,name,is_current) values($1,$2,$3,true)',[season,team,'26/27']);
await db.query('insert into fixtures(id,team_id,season_id,starts_at,home,opponent) values($1,$2,$3,$4,true,$5)',[fixture,team,season,'2026-09-28T20:00:00Z','Test Visitors']);
await db.query('insert into games(id,team_id,fixture_id,match_id,west_green_player_id,opponent_player,west_green_starts) values($1,$2,$3,$4,$5,$6,true)',[game,team,fixture,randomUUID(),player,'Test Opponent']);
const completedMatch=randomUUID();
for (let leg=0;leg<2;leg++) {
 const old=randomUUID();
 await db.query("insert into games(id,team_id,fixture_id,match_id,west_green_player_id,opponent_player,west_green_starts,status,winner,completed_at) values($1,$2,$3,$4,$5,$6,true,'completed','west_green',now())",[old,team,fixture,completedMatch,player,'Earlier Opponent']);
 for (const [index,score,remaining] of [[1,180,321],[2,180,141],[3,141,0]]) {
  await db.query("insert into scoring_events(team_id,game_id,thrower,throw_index,score,darts,remaining_after,is_checkout) values($1,$2,'west_green',$3,$4,3,$5,$6)",[team,old,index,score,remaining,remaining===0]);
 }
}
await db.query('insert into practice_sessions(id,team_id,player_a_id,legs_to_play,start_score) values($1,$2,$3,2,40)',[practice,team,player]);
await db.query('insert into practice_games(id,session_id,leg_index) values($1,$2,1)',[practiceGame,practice]);

await db.query('insert into game_121_sessions(id,team_id,player_id) values($1,$2,$3)',[session121,team,player]);
await db.query('insert into game_121_sessions(id,team_id,player_id,base_checkout,current_checkout,remaining) values($1,$2,$3,158,159,159)',[bogey121,team,player]);
await db.query('insert into game_121_sessions(id,team_id,player_id,current_checkout,remaining,current_turn,advance_base_on_any_finish) values($1,$2,$3,125,40,3,true)',[anyBase121,team,player]);
await db.query('insert into game_121_sessions(id,team_id,player_id,base_checkout,current_checkout,remaining) values($1,$2,$3,158,170,170)',[final121,team,player]);

const parameters={
 wgd_drill_command:['p_mode','p_session','p_team','p_revision','p_request','p_event','p_patch','p_player','p_player_patch'],
 wgd_score_snapshot:['p_game','p_team','p_practice'],
 wgd_score_command_state:['p_game','p_team','p_revision','p_request','p_practice','p_command','p_side','p_score','p_darts'],
 wgd_score_command:['p_game','p_team','p_revision','p_request','p_practice','p_command','p_side','p_score','p_darts']
};
const tables=new Set(['players','seasons','fixtures','games','scoring_events','practice_sessions','practice_games','practice_events','game_121_sessions','game_121_turns']);
const at=(row,path)=>path.split('.').reduce((value,k)=>value?.[k],row);
let loseNext=false;
const adapter=createServer(async(req,res)=>{
 const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
 try {
  assert.equal(req.headers.authorization,'Bearer '+key);
  const url=new URL(req.url,'http://localhost'), name=url.pathname.split('/').pop();
  if (url.pathname.includes('/rpc/')) {
   assert.ok(parameters[name],'Unexpected RPC '+name);
   let body='';for await(const chunk of req)body+=chunk;
   const args=JSON.parse(body);trace.push({rpc:name,game:args.p_game||args.p_session,request:args.p_request});
   const result=(await db.query('select public.'+name+'('+parameters[name].map((_,i)=>'$'+(i+1)).join(',')+') result',parameters[name].map(k=>args[k]??null))).rows[0].result;
   if(loseNext&&(name==='wgd_score_command_state'||name==='wgd_drill_command')){loseNext=false;await new Promise(r=>setTimeout(r,900));send(500,{code:'XX000',message:'Test connection interrupted after saving'});}
   else send(200,result);
   return;
  }
  assert.ok(tables.has(name),'Unexpected table '+name);trace.push({table:name});
  let rows=(await db.query('select * from public.'+name)).rows;
  if(name==='games'||name==='fixtures'||name==='practice_sessions'||name==='game_121_sessions'){
   const players=(await db.query('select * from players')).rows;
   const fixtures=(await db.query('select * from fixtures')).rows;
   const seasons=(await db.query('select * from seasons')).rows;
   const games=(await db.query('select * from games')).rows;
   rows=rows.map(r=>name==='games'?{...r,players:players.find(p=>p.id===r.west_green_player_id),fixtures:fixtures.find(f=>f.id===r.fixture_id)}:
    name==='fixtures'?{...r,seasons:seasons.find(s=>s.id===r.season_id),games:games.filter(g=>g.fixture_id===r.id)}:
    name==='game_121_sessions'?{...r,player:players.find(p=>p.id===r.player_id)}:
    {...r,player_a:players.find(p=>p.id===r.player_a_id),player_b:players.find(p=>p.id===r.player_b_id)});
  }
  for(const [column,value] of url.searchParams){
   if(['select','order','limit','offset'].includes(column))continue;
   if(value.startsWith('eq.'))rows=rows.filter(r=>String(at(r,column))===value.slice(3));
   else if(value.startsWith('in.(')){const ids=value.slice(4,-1).split(',');rows=rows.filter(r=>ids.includes(String(at(r,column))));}
   else if(value==='is.null')rows=rows.filter(r=>at(r,column)==null);
   else throw new Error('Unsupported filter '+column+'='+value);
  }
  const orders=(url.searchParams.get('order')||'').split(',').filter(Boolean);
  rows.sort((a,b)=>{for(const order of orders){const [column,direction]=order.split('.'), av=at(a,column),bv=at(b,column);if(av!==bv)return(av>bv?1:-1)*(direction==='desc'?-1:1);}return 0;});
  const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||rows.length);
  rows=rows.slice(offset,offset+limit);
  if((req.headers.accept||'').includes('vnd.pgrst.object')){
   if(rows.length!==1)send(406,{code:'PGRST116',message:'Expected one row',details:rows.length+' rows'});
   else send(200,rows[0]);
  }else send(200,rows);
 }catch(error){send(400,{code:'P0001',message:error.message});}
});
await new Promise(resolve=>adapter.listen(3101,'127.0.0.1',resolve));
const app=spawn('npm',['run','start','--','-p','3100'],{detached:true,env:{...process.env,SESSION_SECRET:secret,TEAM_ID:team,PIN_HASH:'performance-pin',SUPABASE_SERVICE_ROLE_KEY:key,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:3101'},stdio:['ignore','pipe','pipe']});
app.stdout.on('data',data=>process.stdout.write(data));app.stderr.on('data',data=>process.stderr.write(data));
let browser;
try{
 for(let i=0;i<120;i++){try{await fetch('http://127.0.0.1:3100/login');break;}catch{await new Promise(r=>setTimeout(r,250));}}
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const payload='v1.'+(Math.floor(Date.now()/1000)+86400)+'.'+randomUUID();
 const signature=createHmac('sha256',secret).update(payload+':'+team+':performance-pin').digest('hex');
 await context.addCookies([{name:'wgd_session',value:payload+'.'+signature,url:'http://127.0.0.1:3100',httpOnly:true}]);
 const page=await context.newPage(),errors=[],scripts=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.url().includes('/_next/static/')&&r.url().endsWith('.js'))scripts.push(r.text().catch(()=>''));});
 await page.goto('http://127.0.0.1:3100/dashboard');
 await page.waitForLoadState('networkidle');
 await page.getByRole('link',{name:'Resume scoring',exact:true}).waitFor();
 assert.ok(!(await Promise.all(scripts)).some(s=>s.includes('recharts-wrapper')),'Chart library loaded before expansion');
 assert.ok(!(await page.locator('meta[name=viewport]').getAttribute('content')).includes('maximum-scale=1'));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Dashboard overflows mobile screen');
 const ranking=page.getByLabel('Rank players by');
 assert.equal(await ranking.inputValue(),'performance');
 await page.getByText('How the performance score is calculated',{exact:true}).click();
 await page.getByText('Score breakdown',{exact:true}).first().click();
 assert.ok(await page.getByText(/Provisional: Needs 6 completed legs/).count()>0);
 await ranking.selectOption('wins');assert.equal(await ranking.inputValue(),'wins');
 await ranking.selectOption('performance');
 await page.getByText('How the performance score is calculated',{exact:true}).click();
 await page.getByText('Score breakdown',{exact:true}).first().click();
 console.log('PERFORMANCE_LEADERBOARD_PASS: explanation, sample qualification, player breakdown and win-rate switch');
 await page.getByText('Performance charts',{exact:true}).click();
 await page.locator('.recharts-wrapper').first().waitFor();
 await page.screenshot({path:'performance-verification/dashboard-mobile.png',fullPage:true});
 console.log('MOBILE_DASHBOARD_PASS: resume link, deferred charts, zoom and width');
 await page.getByRole('link',{name:'Resume scoring',exact:true}).click();
 const enter=page.getByRole('button',{name:'Enter score',exact:true});
 await enter.waitFor();await page.waitForFunction(()=>!document.querySelector('button[aria-label="Enter score"]')?.disabled);
 const digits=async(value)=>{for(const digit of String(value))await page.locator('.keypad-key').filter({hasText:new RegExp('^'+digit+'$')}).click();};
 await digits(60);loseNext=true;await enter.click();
 await page.getByRole('status').filter({hasText:'Saving'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'1',exact:true}).isDisabled(),true);
 await page.getByRole('button',{name:'Retry save',exact:true}).waitFor();
 assert.equal(await page.locator('#summary .score-remaining').textContent(),'60');
 await page.getByRole('button',{name:'Retry save',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Saved'}).waitFor();
 assert.equal((await db.query('select count(*)::int n from scoring_events where game_id=$1 and not is_deleted',[game])).rows[0].n,1);
 const retries=trace.filter(t=>t.rpc==='wgd_score_command_state');
 assert.equal(retries.length,2);assert.equal(retries[0].request,retries[1].request);
 console.log('LOST_RESPONSE_RETRY_PASS: one visit, stable request ID, retained entry and locked inputs');
 trace.length=0;
 await digits(60);await enter.click();
 await page.getByRole('status').filter({hasText:'Saved'}).waitFor();
 assert.equal((await db.query('select revision from games where id=$1',[game])).rows[0].revision,2);
 assert.deepEqual(trace.map(t=>t.rpc||t.table),['wgd_score_command_state']);
 console.log('ONE_REQUEST_SCORE_PASS: normal score uses one atomic RPC');
 await db.query("select wgd_score_command_state($1,$2,2,$3,false,'record','west_green',100,3)",[game,team,randomUUID()]);
 await digits(60);await enter.click();
 await page.getByRole('button',{name:'Reload latest score',exact:true}).waitFor();
 await page.getByRole('button',{name:'Reload latest score',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Saved'}).waitFor();
 assert.equal(await page.locator('#summary .score-remaining').textContent(),'60');
 assert.equal((await db.query('select revision from games where id=$1',[game])).rows[0].revision,3);
 await page.screenshot({path:'performance-verification/scoring-mobile.png',fullPage:true});
 console.log('STALE_REVISION_RELOAD_PASS: another-device edit, retained entry, no accidental submission');
 await page.goto('http://127.0.0.1:3100/practice/scoring?session='+practice+'&game='+practiceGame);
 const practiceEnter=page.getByRole('button',{name:'Enter',exact:true});
 await practiceEnter.waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Enter'&&!b.disabled));
 for(const digit of ['4','0'])await page.getByRole('button',{name:digit,exact:true}).click();
 await practiceEnter.click();await page.getByRole('button',{name:'1 dart',exact:true}).click();
 await page.getByRole('button',{name:'Undo checkout',exact:true}).waitFor();
 await page.getByRole('button',{name:'Undo checkout',exact:true}).click();
 await practiceEnter.waitFor();
 assert.equal((await db.query('select count(*)::int n from practice_events where game_id=$1 and not is_deleted',[practiceGame])).rows[0].n,0);
 assert.equal((await db.query('select status from practice_games where id=$1',[practiceGame])).rows[0].status,'in_progress');
 console.log('PRACTICE_CHECKOUT_UNDO_PASS');
 // 121: exercise real actions and SQL, including a lost committed response.
 const open121=async(id)=>{
  await page.goto('http://127.0.0.1:3100/practice/121/scoring?session='+id);
  await page.getByRole('textbox',{name:'Visit score',exact:true}).waitFor();
  await page.waitForFunction(()=>!document.getElementById('visit-score')?.disabled);
 };
 const scoreField=()=>page.getByRole('textbox',{name:'Visit score',exact:true});
 const remaining=()=>page.getByLabel('Remaining score',{exact:true});
 const enter121=()=>page.getByRole('button',{name:'Enter score',exact:true});
 const enterScore=async(value)=>{
  await scoreField().fill(String(value));await enter121().click();
 };
 const ready121=async()=>{await page.waitForFunction(()=>{const input=document.getElementById('visit-score');return input&&!input.disabled;});};
 const read121=async(id)=>(await db.query('select * from game_121_sessions where id=$1',[id])).rows[0];
 await open121(session121);
 assert.equal(await remaining().textContent(),'121');
 assert.equal(await page.getByRole('list',{name:'Suggested dart targets',exact:true}).getByRole('listitem').count(),3);
 for(const label of ['T20','T11','D14'])await page.getByText(label,{exact:true}).first().waitFor();
 const bounds=await enter121().boundingBox();
 assert.ok(bounds.y+bounds.height<=844,'121 score entry needs excessive scrolling: '+JSON.stringify(bounds));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'121 screen overflows mobile width');
 const font=await remaining().evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
 assert.ok(font>=72,'Remaining score must be easy to glance at');
 await page.getByRole('button',{name:'1',exact:true}).click();
 await page.getByRole('button',{name:'2',exact:true}).click();
 await page.getByRole('button',{name:'1',exact:true}).click();
 await page.getByRole('button',{name:'Delete last digit',exact:true}).click();assert.equal(await scoreField().inputValue(),'12');
 await page.getByRole('button',{name:'Clear',exact:true}).click();assert.equal(await enter121().isDisabled(),true);
 await page.getByRole('button',{name:'6',exact:true}).click();await page.getByRole('button',{name:'0',exact:true}).click();
 loseNext=true;trace.length=0;await enter121().click();
 await page.getByRole('status').filter({hasText:'Saving'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'6',exact:true}).isDisabled(),true);
 await page.getByRole('button',{name:'Retry save',exact:true}).waitFor();assert.equal(await scoreField().inputValue(),'60');
 await page.getByRole('button',{name:'Retry save',exact:true}).click();await ready121();
 assert.equal(await remaining().textContent(),'61');
 const requests121=trace.filter(t=>t.rpc==='wgd_drill_command');
 assert.equal(requests121.length,2);assert.equal(requests121[0].request,requests121[1].request);
 assert.equal((await db.query('select count(*)::int n from game_121_turns where session_id=$1',[session121])).rows[0].n,1);
 for(const label of ['T15','D8'])await page.getByText(label,{exact:true}).first().waitFor();
 await page.getByText('Checkout help & game rules',{exact:true}).click();
 await page.getByText('If your first dart hits S15',{exact:true}).waitFor();
 await page.getByText('Checkout help & game rules',{exact:true}).click();
 await enterScore(61);await page.getByRole('dialog').waitFor();
 await page.getByRole('button',{name:'No double · record a bust',exact:true}).click();await ready121();
 assert.equal(await remaining().textContent(),'61');assert.equal((await read121(session121)).current_turn,3);
 await page.getByRole('button',{name:'Miss · 0',exact:true}).click();await ready121();
 assert.equal(await remaining().textContent(),'121');assert.equal((await read121(session121)).current_turn,1);
 await enterScore(121);await page.getByRole('button',{name:'Edit score',exact:true}).click();
 assert.equal(await scoreField().inputValue(),'121');
 await enter121().click();await page.getByRole('button',{name:'Confirm double-out',exact:true}).click();await ready121();
 assert.equal(await remaining().textContent(),'122');
 await scoreField().fill('181');assert.equal(await enter121().isDisabled(),true);
 await scoreField().fill('122');await enter121().click();await page.getByRole('button',{name:'Confirm double-out',exact:true}).click();await ready121();
 assert.equal((await read121(session121)).base_checkout,122);
 const current=await read121(session121);
 await db.query("select wgd_drill_command('121',$1,$2,$3,$4,$5,$6,null,null)",[session121,team,current.revision,randomUUID(),
  {score:20,remaining_after:103,is_bust:false,result:null},
  {base_checkout:122,current_checkout:123,current_turn:2,remaining:103,status:'in_progress',completed_at:null}]);
 await enterScore(60);await page.getByRole('button',{name:'Reload latest score',exact:true}).waitFor();
 await page.getByRole('button',{name:'Reload latest score',exact:true}).click();await ready121();
 assert.equal(await scoreField().inputValue(),'60');assert.equal(await remaining().textContent(),'103');
 assert.equal((await read121(session121)).revision,current.revision+1);
 await page.getByRole('button',{name:'Clear',exact:true}).click();
 await page.screenshot({path:'performance-verification/121-scoring-mobile.png',fullPage:true});
 await page.getByRole('link',{name:'‹ 121 Challenge',exact:true}).click();
 await page.getByRole('heading',{name:'Resume a saved game',exact:true}).waitFor();
 await page.locator('a[href="/practice/121/scoring?session='+session121+'"]').click();await ready121();
 assert.equal(await remaining().textContent(),'103');
 console.log('121_ENTRY_RETRY_RESUME_PASS');
 await open121(bogey121);
 await page.getByText('No three-dart checkout · set up the next visit',{exact:true}).waitFor();
 await enterScore(127);await ready121();assert.equal(await remaining().textContent(),'32');
 await page.getByText('D16',{exact:true}).first().waitFor();
 await enterScore(32);await page.getByRole('button',{name:'Confirm double-out',exact:true}).click();await ready121();
 assert.equal((await read121(bogey121)).current_checkout,160);assert.equal((await read121(bogey121)).base_checkout,158);
 await page.getByRole('button',{name:'End game',exact:true}).click();
 await page.getByRole('button',{name:'Yes, end game',exact:true}).click();
 await page.waitForURL('**/practice/121',{timeout:10000}).catch(async error=>{
  console.error('121_END_GAME_DIAGNOSTIC',JSON.stringify(await read121(bogey121)),await page.locator('body').innerText(),JSON.stringify(trace.slice(-15)));
  await page.screenshot({path:'performance-verification/121-end-game-failure.png',fullPage:true});throw error;
 });assert.equal((await read121(bogey121)).status,'abandoned');
 await open121(anyBase121);await enterScore(40);await page.getByRole('button',{name:'Confirm double-out',exact:true}).click();await ready121();
 assert.equal((await read121(anyBase121)).base_checkout,125);
 await open121(final121);await enterScore(170);loseNext=true;trace.length=0;
 await page.getByRole('button',{name:'Confirm double-out',exact:true}).click();
 await page.getByRole('button',{name:'Retry save',exact:true}).waitFor();
 await page.getByRole('button',{name:'Retry save',exact:true}).click();
 await page.getByRole('heading',{name:'You finished 170!',exact:true}).waitFor();
 assert.equal((await read121(final121)).status,'won');
 assert.equal((await db.query('select count(*)::int n from game_121_turns where session_id=$1',[final121])).rows[0].n,1);
 await page.screenshot({path:'performance-verification/121-win-mobile.png',fullPage:true});
 // Shorter narrow screens still have full-width controls and readable guidance.
 await page.setViewportSize({width:320,height:568});await open121(session121);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'121 overflows a narrow phone');
 await page.screenshot({path:'performance-verification/121-narrow-mobile.png',fullPage:true});
 console.log('121_GUIDANCE_AND_MOBILE_PASS: routes, single miss help, larger remaining score, keypad, preview, width and resume');
 console.log('121_PROGRESSION_PASS: declared bust, miss, base reset, double confirmation, standard/any-finish base modes and 170 completion');
 console.log('121_RETRY_AND_RELOAD_PASS: stable request IDs, no duplicate visits, completed-session recovery and retained input on stale reload');
 assert.deepEqual(errors,[]);
 writeFileSync('performance-verification/requests.json',JSON.stringify(trace,null,2));
 console.log('BROWSER_VERIFICATION_PASS');
}finally{
 if(browser)await browser.close();
 process.kill(-app.pid,'SIGTERM');app.stdout.destroy();app.stderr.destroy();app.unref();
 adapter.close();await db.close();
}
