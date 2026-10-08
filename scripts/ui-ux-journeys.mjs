import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {verifySetupJourneys} from './ui-ux-setup-journeys.mjs';
import {pauseAndWait} from './ui-ux-browser-helpers.mjs';

export async function verifyJourneys({browser,runtime,out}) {
 const {rt,db}=runtime, results=[],errors=[],failures=[];
 const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});await ctx.addCookies([rt.cookie]);
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
 const goto=async route=>{await page.goto(rt.appUrl+route,{waitUntil:'networkidle'});};
 const poll=async(sql,params,check)=>{for(let i=0;i<100;i++){const rows=(await db.query(sql,params)).rows;if(check(rows))return rows;await page.waitForTimeout(50);}throw new Error('Persisted state did not reach the expected result: '+sql);};
 const count=async(table,column,id)=>Number((await db.query(`select count(*)::int n from ${table} where ${column}=$1`,[id])).rows[0].n);
 async function step(name,fn){try{await fn();}catch(error){console.error('JOURNEY_FAIL',name,error.message,'at',page.url(),(await page.locator('body').innerText()).slice(0,2500));await page.screenshot({path:out+'/journey-failure-'+failures.length+'.png',fullPage:true});failures.push({name,error:error.message});results.push({name,passed:false});return;}results.push({name,passed:true});console.log('JOURNEY_PASS',name);}
 try {
 await step('Theme persistence, first paint, independent devices and contrast',async()=>{
  await goto('/settings');await page.getByRole('radio',{name:'Light',exact:true}).check({force:true});await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light');
  const firstPaint=await ctx.newPage();await firstPaint.route('**/_next/static/**/*.js',r=>r.abort());await firstPaint.goto(rt.appUrl+'/dashboard',{waitUntil:'domcontentloaded'});
  assert.equal(await firstPaint.evaluate(()=>document.documentElement.dataset.theme),'light','Inline theme must work before React loads');await firstPaint.close();
  const independent=await browser.newContext();await independent.addCookies([rt.cookie]);const other=await independent.newPage();await other.goto(rt.appUrl+'/settings',{waitUntil:'networkidle'});assert.equal(await other.evaluate(()=>document.documentElement.dataset.theme),'dark');await independent.close();
  const colours=await page.evaluate(()=>{const b=document.querySelector('.btn-primary')||document.querySelector('.btn-secondary');const s=getComputedStyle(b);return {fg:s.color,bg:s.backgroundColor};});
  const luminance=rgb=>rgb.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((n,x,i)=>n+x*[.2126,.7152,.0722][i],0);
  const a=luminance(colours.fg),b=luminance(colours.bg);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5);
 });
 await step('Safe full scoring destination through keyboard PIN and device lock',async()=>{
  const locked=await browser.newContext({viewport:{width:390,height:844}}),p=await locked.newPage();await p.goto(rt.appUrl+rt.routes.leagueScoring,{waitUntil:'networkidle'});
  assert.equal(new URL(p.url()).pathname,'/pin');assert.equal(new URL(p.url()).searchParams.get('redirect'),rt.routes.leagueScoring);
  await p.getByLabel('Team PIN',{exact:true}).fill(rt.pin_input);await p.getByLabel('Team PIN',{exact:true}).press('Enter');await p.waitForURL('**/scoring?**');await p.waitForLoadState('networkidle');
  assert.equal(new URL(p.url()).searchParams.get('game'),rt.liveGame);assert.equal(new URL(p.url()).searchParams.get('fixture'),rt.liveFixture);
  await p.goto(rt.appUrl+'/settings',{waitUntil:'networkidle'});assert.equal(new URL(p.url()).pathname,'/settings', 'Unlock must persist to Settings');await p.getByRole('button',{name:'Lock this device',exact:true}).click();await p.getByRole('group',{name:'Lock this device',exact:true}).getByRole('button',{name:'Lock this device',exact:true}).click();await p.waitForURL('**/pin');
  await p.goto(rt.appUrl+rt.routes.leagueScoring,{waitUntil:'networkidle'});assert.equal(new URL(p.url()).pathname,'/pin');await locked.close();
 });
 await step('Season browsing preserves default and linked profile history return',async()=>{
  const before=(await db.query('select id from seasons where team_id=$1 and is_current',[rt.team])).rows[0].id;
  await goto('/stats?view=players&season='+rt.oldSeason);await goto('/stats/players/'+rt.firstPlayer+'?view=matches&season='+rt.season);
  const review=page.locator('a[href^="/matches/"]').first();assert.ok(await review.count()>0);const href=await review.getAttribute('href');assert.ok(href.includes('returnTo='));await review.click();await page.waitForURL('**/matches/**');
  const back=page.getByRole('link',{name:/player profile/i}).first();await back.waitFor();await back.click();await page.waitForURL('**/stats/players/**');await page.getByRole('heading',{name:'Alex Carter',exact:true}).waitFor();assert.equal(new URL(page.url()).pathname,'/stats/players/'+rt.firstPlayer);
  assert.equal((await db.query('select id from seasons where team_id=$1 and is_current',[rt.team])).rows[0].id,before);
 });
 await step('Saved practice discovery covers every mode and player filters',async()=>{
  await goto('/practice');await page.getByRole('heading',{name:'Continue playing',exact:true}).waitFor();const continueSection=page.locator('section').filter({has:page.getByRole('heading',{name:'Continue playing',exact:true})});
  for(const mode of ['X01','121 Challenge','Doubles Switch','Random Checkout'])assert.ok(await continueSection.locator('li strong').getByText(mode,{exact:true}).count()>0,mode+' not discoverable');
  await continueSection.getByRole('combobox',{name:/^Mode/}).selectOption('checkout');assert.equal(await continueSection.locator('li strong').getByText('X01',{exact:true}).count(),0);assert.ok(await continueSection.locator('li strong').getByText('Random Checkout',{exact:true}).count()>0);
  await continueSection.getByRole('combobox',{name:/^Player/}).selectOption(rt.firstPlayer);assert.equal(await continueSection.locator('li strong').getByText('Random Checkout',{exact:true}).count(),0);
 });
 await step('X01 empty versus zero, lost-response retry, pause/resume and end correction',async()=>{
  await goto(rt.routes.practiceScoring);await page.getByLabel('Visit score',{exact:true}).waitFor();assert.ok(await page.getByRole('button',{name:'Enter',exact:true}).isDisabled());
  await page.getByRole('button',{name:'0',exact:true}).click();assert.equal(await page.getByLabel('Visit score',{exact:true}).inputValue(),'0');await page.getByRole('button',{name:'Clear',exact:true}).click();
  const before=await count('practice_events','game_id',rt.practiceGame);runtime.loseResponseOnce('wgd_score_command_state');await page.getByLabel('Visit score',{exact:true}).fill('60');await page.getByRole('button',{name:'Enter',exact:true}).click();await page.getByRole('button',{name:'Retry save',exact:true}).waitFor();
  assert.equal(await page.getByLabel('Visit score',{exact:true}).inputValue(),'60');assert.equal(await count('practice_events','game_id',rt.practiceGame),before+1);
  await page.getByRole('button',{name:'Retry save',exact:true}).click();await page.getByRole('button',{name:'Retry save',exact:true}).waitFor({state:'hidden'});assert.equal(await count('practice_events','game_id',rt.practiceGame),before+1);
  await pauseAndWait(page);await goto(rt.routes.practiceScoring);
  await page.getByRole('button',{name:'Undo',exact:true}).click();await poll('select count(*)::int n from practice_events where game_id=$1 and not is_deleted',[rt.practiceGame],r=>r[0].n===before);
  await page.getByRole('button',{name:'End & results',exact:true}).click();await poll('select status from practice_sessions where id=$1',[rt.practiceSession],r=>r[0].status==='cancelled');await page.getByRole('button',{name:'Undo end session',exact:true}).click();await poll('select status from practice_sessions where id=$1',[rt.practiceSession],r=>r[0].status==='in_progress');
 });
 await step('Random Checkout retry, attempt undo, results and end reopening',async()=>{
  await goto(rt.routes.checkoutScoring);const before=await count('checkout_practice_attempts','session_id',rt.checkoutSession);runtime.loseResponseOnce('wgd_drill_command');await page.getByRole('button',{name:'2 darts',exact:true}).click();await page.getByRole('button',{name:'Retry save',exact:true}).waitFor();assert.equal(await count('checkout_practice_attempts','session_id',rt.checkoutSession),before+1);
  await page.getByRole('button',{name:'Retry save',exact:true}).click();await page.getByRole('button',{name:'Retry save',exact:true}).waitFor({state:'hidden'});assert.equal(await count('checkout_practice_attempts','session_id',rt.checkoutSession),before+1);
  await page.getByRole('button',{name:'Undo last attempt',exact:true}).click();await poll('select attempt_index,current_target from checkout_practice_sessions where id=$1',[rt.checkoutSession],r=>r[0].attempt_index===0&&r[0].current_target===100);
  await page.getByRole('button',{name:'End & results',exact:true}).click();await page.getByRole('button',{name:'End & results',exact:true}).click();await page.getByRole('heading',{name:'Session results',exact:true}).waitFor();await page.getByRole('button',{name:'Undo final action',exact:true}).click();await page.getByRole('heading',{name:'Checkout practice',exact:true}).waitFor();
 });
 await step('Doubles explicit dart outcomes, fair round end and final visit undo',async()=>{
  await goto(rt.routes.doublesScoring);await page.getByRole('button',{name:'3rd dart',exact:true}).click();await poll('select current_slot from doubles_practice_sessions where id=$1',[rt.doublesSession],r=>r[0].current_slot===1);
  const first=(await db.query('select dart_hit from doubles_practice_attempts where session_id=$1 order by id',[rt.doublesSession])).rows[0];assert.equal(first.dart_hit,3);
  await page.getByRole('button',{name:'End & results',exact:true}).click();await page.getByRole('button',{name:'Finish round & results',exact:true}).click();await poll('select end_after_round from doubles_practice_sessions where id=$1',[rt.doublesSession],r=>r[0].end_after_round===true);
  for(let i=0;i<3;i++){await page.getByRole('button',{name:'All 3 missed',exact:true}).click();await page.waitForTimeout(250);}
  await page.getByRole('heading',{name:'Session results',exact:true}).waitFor();const visits=(await db.query('select round_index from doubles_practice_players where session_id=$1',[rt.doublesSession])).rows;assert.ok(visits.every(r=>r.round_index===1));
  await page.getByRole('button',{name:'Undo final action',exact:true}).click();await page.getByRole('heading',{name:'Doubles practice',exact:true}).waitFor();await poll('select status,current_slot from doubles_practice_sessions where id=$1',[rt.doublesSession],r=>r[0].status==='in_progress'&&r[0].current_slot===3);
 });
 await step('121 checkout confirmation, progression, retry, undo and pause',async()=>{
  await goto(rt.routes.game121Scoring);const input=page.getByLabel('Visit score',{exact:true});await input.fill('121');await page.getByRole('button',{name:'Enter score',exact:true}).click();
  await page.getByRole('button',{name:"Confirm double-out",exact:true}).first().click();await poll('select current_checkout from game_121_sessions where id=$1',[rt.session121],r=>r[0].current_checkout===122);
  await page.getByRole('button',{name:'Undo last visit',exact:true}).click();await poll('select current_checkout,remaining from game_121_sessions where id=$1',[rt.session121],r=>r[0].current_checkout===121&&r[0].remaining===121);
  runtime.loseResponseOnce('wgd_drill_command');await input.fill('60');await page.getByRole('button',{name:'Enter score',exact:true}).click();await page.getByRole('button',{name:'Retry save',exact:true}).waitFor();const n=await count('game_121_turns','session_id',rt.session121);await page.getByRole('button',{name:'Retry save',exact:true}).click();await page.getByRole('button',{name:'Retry save',exact:true}).waitFor({state:'hidden'});assert.equal(await count('game_121_turns','session_id',rt.session121),n);
  await pauseAndWait(page);await goto(rt.routes.game121Scoring);assert.equal((await db.query('select remaining from game_121_sessions where id=$1',[rt.session121])).rows[0].remaining,61);
 });
 await step('League West-only guidance, next-leg undo and completed result correction',async()=>{
  await goto(rt.routes.leagueScoring);assert.ok(await page.getByLabel('Checkout guidance for West Green player Alex Carter',{exact:true}).count()>0);assert.ok((await page.locator('body').innerText()).includes('Opponent is throwing'));assert.ok(await page.getByRole('button',{name:'Save entered score',exact:true}).isDisabled());
  const finish=async(score,darts)=>{await page.getByLabel(/scored$/).fill(String(score));await page.getByRole('button',{name:'Save entered score',exact:true}).click();await page.getByRole('button',{name:darts+' dart'+(darts===1?'':'s'),exact:true}).click();};
  await finish(40,1);await page.waitForURL(u=>new URL(u).searchParams.get('game')!==rt.liveGame);await page.getByRole('button',{name:'Undo previous leg checkout',exact:true}).waitFor();await page.getByRole('button',{name:'Undo previous leg checkout',exact:true}).click();await page.getByRole('button',{name:'Reopen and undo checkout',exact:true}).click();await page.waitForURL(u=>new URL(u).searchParams.get('game')===rt.liveGame);await page.waitForLoadState('networkidle');
  await finish(40,1);await page.waitForURL(u=>new URL(u).searchParams.get('game')!==rt.liveGame);await page.waitForLoadState('networkidle');
  const second=new URL(page.url()).searchParams.get('game');
  for(const score of [180,180]){await page.locator('.score-panel').first().click();await page.getByLabel(/scored$/).fill(String(score));await page.getByRole('button',{name:'Save entered score',exact:true}).click();await page.getByRole('button',{name:'Save entered score',exact:true}).waitFor({state:'visible'});await page.waitForTimeout(200);}
  await page.locator('.score-panel').first().click();await finish(141,3);await page.getByRole('button',{name:'Correct result',exact:true}).waitFor();await page.getByRole('button',{name:'Correct result',exact:true}).click();await page.getByRole('button',{name:'Reopen and undo checkout',exact:true}).click();await poll('select status from games where id=$1',[second],r=>r[0].status==='in_progress');await finish(141,3);await page.getByRole('link',{name:'Continue to fixture',exact:true}).click();await page.waitForLoadState('networkidle');assert.ok((await page.locator('body').innerText()).includes('1 of 6 matches complete'));
 });
 await step('Tonight persists after kickoff, fifth match, final result and reopened match',async()=>{
  let sixth;
  for(let slot=2;slot<=6;slot++){
   const game=randomUUID(),mid=randomUUID();
   await db.query("insert into games(id,team_id,fixture_id,match_id,match_position,west_green_player_id,opponent_player,west_green_starts,status,winner) values($1,$2,$3,$4,$5,$6,$7,true,'completed','west_green')",[game,rt.team,rt.liveFixture,mid,slot,rt.players[slot-1].id,'Fixture visitor '+slot]);
   sixth=randomUUID();await db.query("insert into games(id,team_id,fixture_id,match_id,match_position,west_green_player_id,opponent_player,west_green_starts,status,winner) values($1,$2,$3,$4,$5,$6,$7,false,$8,$9)",[sixth,rt.team,rt.liveFixture,mid,slot,rt.players[slot-1].id,'Fixture visitor '+slot,slot===6?'in_progress':'completed',slot===6?null:'west_green']);
  }
  await goto('/dashboard');assert.ok((await page.locator('body').innerText()).includes('Tonight’s game'));assert.ok((await page.locator('body').innerText()).includes('5 of 6 matches complete'));
  await db.query("update games set status='completed',winner='west_green' where id=$1",[sixth]);await goto('/dashboard');assert.ok(!(await page.locator('body').innerText()).includes('Tonight’s game'));assert.ok((await page.locator('body').innerText()).includes('Latest result'));assert.ok((await page.locator('body').innerText()).includes('Next game'));
  await db.query("update games set status='in_progress',winner=null where id=$1",[sixth]);await goto('/dashboard');assert.ok((await page.locator('body').innerText()).includes('5 of 6 matches complete'));assert.ok((await page.locator('body').innerText()).includes('Tonight’s game'));
 });
 await step('Match creation retained on lost response, direct scoring and stable replacement slot',async()=>{
  await goto(rt.routes.futureFixture);await page.getByLabel('West Green player',{exact:true}).selectOption(rt.firstPlayer);await page.getByLabel('Opponent player',{exact:true}).fill('Browser guest');runtime.loseResponseOnce('wgd_create_fixture_match');
  await page.getByRole('button',{name:'Start match and score',exact:true}).click();await page.locator('form').filter({has:page.locator('input[name=gameRequest]')}).getByRole('alert').waitFor();assert.equal(await page.getByLabel('Opponent player',{exact:true}).inputValue(),'Browser guest');assert.equal(await count('games','fixture_id',rt.futureFixture),1);
  await page.getByRole('button',{name:'Start match and score',exact:true}).click();await page.waitForURL('**/scoring?**');assert.equal(await count('games','fixture_id',rt.futureFixture),1);
  await goto(rt.routes.futureFixture);await page.getByRole('button',{name:'Delete match 1',exact:true}).click();await page.getByRole('button',{name:'Confirm delete',exact:true}).click();await poll('select count(*)::int n from games where fixture_id=$1 and not deleted',[rt.futureFixture],r=>r[0].n===0);
  await page.getByLabel('West Green player',{exact:true}).selectOption(rt.firstPlayer);await page.getByLabel('Opponent player',{exact:true}).fill('Replacement guest');await page.getByRole('button',{name:'Start match and score',exact:true}).click();await page.waitForURL('**/scoring?**');const replacement=new URL(page.url()).searchParams.get('game');assert.equal((await db.query('select match_position from games where id=$1',[replacement])).rows[0].match_position,1);
 });
 await step('Fixture form retains input after lost response and saves exactly once',async()=>{
  await goto('/fixtures');await page.getByText('Add fixture',{exact:true}).click();const form=page.locator('form').filter({has:page.locator('input[name=fixtureRequest]')});
  await form.getByLabel('Opponent',{exact:true}).fill('Browser created team');await form.getByLabel('Date & time (UK)',{exact:true}).fill('2027-02-01T20:00');await form.getByLabel('Venue (optional)',{exact:true}).fill('Synthetic club');runtime.loseResponseOnce('wgd_create_fixture');
  await form.getByRole('button',{name:'Save fixture',exact:true}).click();await form.getByRole('alert').waitFor();assert.equal(await form.getByLabel('Opponent',{exact:true}).inputValue(),'Browser created team');
  assert.equal((await db.query('select count(*)::int n from fixtures where opponent=$1',['Browser created team'])).rows[0].n,1);
  await form.getByRole('button',{name:'Save fixture',exact:true}).click();await form.getByRole('status').waitFor();assert.equal((await db.query('select count(*)::int n from fixtures where opponent=$1',['Browser created team'])).rows[0].n,1);assert.equal(await form.getByLabel('Opponent',{exact:true}).inputValue(),'');
 });
 await step('Killer device save, resume discovery and full-state Undo',async()=>{
  await goto('/pub-games/killer');await page.getByLabel('Guest name',{exact:true}).fill('Browser Alice');await page.getByRole('button',{name:'Add',exact:true}).click();await page.getByLabel('Guest name',{exact:true}).fill('Browser Bob');await page.getByRole('button',{name:'Add',exact:true}).click();await page.getByRole('button',{name:'Undo last action',exact:true}).click();assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('wgd_killer_game')).game)).players.length,1);await page.getByLabel('Guest name',{exact:true}).fill('Browser Bob');await page.getByRole('button',{name:'Add',exact:true}).click();await page.getByRole('button',{name:'Start Game',exact:true}).click();await page.waitForTimeout(1000);
  const started=await page.evaluate(()=>JSON.parse(localStorage.getItem('wgd_killer_game')).game);assert.notEqual(started.state,'waiting_for_players');assert.equal(started.players.length,2);
  await pauseAndWait(page);await page.getByRole('heading',{name:'Continue playing',exact:true}).waitFor();await page.locator('section').filter({has:page.getByRole('heading',{name:'Continue playing',exact:true})}).getByRole('link',{name:/Killer/}).waitFor();await goto('/pub-games/killer');await page.getByRole('button',{name:'Resume game',exact:true}).waitFor();await page.getByRole('button',{name:'Resume game',exact:true}).click();assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('wgd_killer_game')).game)).players.length,2);
 });
 await step('Practice setup and resume journeys',async()=>{results.push(...await verifySetupJourneys({page,rt,db,goto,poll}));});
 await step('Roster duplicate feedback keeps entries and deactivation preserves history',async()=>{
  await goto('/players');const add=page.locator('form').filter({has:page.getByRole('button',{name:'Add player',exact:true})});await add.getByLabel('Player name',{exact:true}).fill('Alex Carter');await add.getByRole('button',{name:'Add player',exact:true}).click();await add.getByRole('alert').waitFor();assert.equal(await add.getByLabel('Player name',{exact:true}).inputValue(),'Alex Carter');
  const row=page.locator('div').filter({has:page.getByRole('link',{name:'Manage Alex Carter',exact:true})}).filter({has:page.getByRole('button',{name:'Deactivate',exact:true})}).last();await row.getByRole('button',{name:'Deactivate',exact:true}).click();await row.getByRole('button',{name:'Cancel',exact:true}).press('Escape');assert.equal((await db.query('select active from players where id=$1',[rt.firstPlayer])).rows[0].active,true);
  await row.getByRole('button',{name:'Deactivate',exact:true}).click();await row.getByRole('group',{name:'Deactivate',exact:true}).getByRole('button',{name:'Deactivate',exact:true}).click();await poll('select active from players where id=$1',[rt.firstPlayer],r=>r[0].active===false);
  await goto('/stats/players/'+rt.firstPlayer+'?view=matches');assert.ok((await page.locator('body').innerText()).includes('Inactive'));assert.ok(await page.locator('a[href^="/matches/"]').count()>0);
 });
 await step('Roster read failure is explicit and never replaced by sample players',async()=>{
  runtime.failReads('players');await goto('/players');await page.getByRole('heading',{name:'The request could not be completed',exact:true}).waitFor();assert.ok(!(await page.locator('body').innerText()).includes('Player A'));runtime.clearFault();await page.getByRole('button',{name:'Try again',exact:true}).click();await page.getByRole('heading',{name:'Team roster',exact:true}).waitFor();
 });
 assert.deepEqual(errors,[]);
 assert.deepEqual(failures,[],'All browser journeys must pass');
 } finally {
  writeFileSync(out+'/journey-checks.json',JSON.stringify({dataset:'Synthetic local PGlite records; browser actions verified against persisted SQL',results,failures,pageErrors:errors},null,2));await ctx.close();
 }
}
