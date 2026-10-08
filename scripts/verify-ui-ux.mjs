const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
import { startUIRuntime } from './ui-ux-runtime.mjs';
import { verifyJourneys } from './ui-ux-journeys.mjs';
import {verifyResultScreens} from './ui-ux-results.mjs';
import {writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const runtime=await startUIRuntime(); const { rt }=runtime;
const out=process.env.UI_UX_EVIDENCE_DIR || 'ui-ux-verification';mkdirSync(out,{recursive:true});
let browser;
try {
browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,headless:true,args:['--no-sandbox']});
const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});await ctx.addCookies([rt.cookie]);
const page=await ctx.newPage(), errors=[], captures=[];
page.on('pageerror',e=>errors.push({url:page.url().replace(rt.appUrl,''),error:e.message}));
const targets=[['home','/dashboard'],['fixtures','/fixtures'],['fixture-live',rt.routes.liveFixture],['fixture-next',rt.routes.futureFixture],['practice','/practice'],['stats-team','/stats?view=team'],['stats-players','/stats?view=players'],['stats-league','/stats?view=league'],['profile','/stats/players/'+rt.firstPlayer],['profile-matches','/stats/players/'+rt.firstPlayer+'?view=matches'],['profile-practice','/stats/players/'+rt.firstPlayer+'?view=practice'],['roster','/players'],['roster-edit',rt.routes.longNamePlayer],['settings','/settings'],['seasons','/seasons'],['league-scoring',rt.routes.leagueScoring],['x01',rt.routes.practiceScoring],['121','/practice/121'],['121-scoring',rt.routes.game121Scoring],['doubles','/practice/doubles'],['doubles-scoring',rt.routes.doublesScoring],['checkout','/practice/checkout'],['checkout-scoring',rt.routes.checkoutScoring],['killer','/pub-games/killer'],['match-review',rt.routes.match],['league-insights','/league-insights']];
async function capture(label,route,theme,width,height,shot=false){
 await page.setViewportSize({width,height});const r=await page.goto(rt.appUrl+route,{waitUntil:'networkidle'});await page.waitForTimeout(150);
 const metric=await page.evaluate(()=>{
  const controls=[...document.querySelectorAll('button,a,input,select')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height&&getComputedStyle(el).visibility!=='hidden';}).map(el=>{const b=el.getBoundingClientRect(),s=getComputedStyle(el);return {name:el.getAttribute('aria-label')||el.textContent.trim().replace(/\s+/g,' ').slice(0,70)||el.id,tag:el.tagName,x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height),color:s.color,bg:s.backgroundColor,disabled:!!el.disabled};});
  return {theme:document.documentElement.dataset.theme,width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight,title:document.querySelector('h1')?.textContent,text:document.body.innerText.slice(0,2500),error:document.body.innerText.includes('The request could not be completed'),activeNav:document.querySelector('[aria-label="Primary"] [aria-current="page"]')?.textContent.trim()||null,controls};
 });
 captures.push({label,route,status:r.status(),...metric});
 assert.equal(metric.theme,theme,'Theme was not restored on navigation');
 if(shot)await page.screenshot({path:out+'/'+label+'-'+theme+'-'+width+'.png'});
 console.log(JSON.stringify({label,theme,width,status:r.status(),overflow:metric.documentWidth>width,error:metric.error,title:metric.title}));
}
try{
 if(process.env.UI_UX_JOURNEYS_ONLY !== '1') for(const theme of ['dark','light']){
  await page.goto(rt.appUrl+'/settings',{waitUntil:'networkidle'});
  await page.getByRole('radio',{name:theme==='light'?'Light':'Dark',exact:true}).check({force:true});
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),theme);
  for(const [label,route]of targets)await capture(label,route,theme,390,844,['home','fixture-live','practice','stats-players','league-scoring'].includes(label));
  for(const [label,route]of targets.filter(([name])=>['home','fixture-live','practice','roster','x01','doubles','121-scoring','league-scoring','profile'].includes(name)))await capture(label+'-small',route,theme,320,568);
  for(const [label,route]of targets.filter(([name])=>['league-scoring','121-scoring','x01'].includes(name)))await capture(label+'-landscape',route,theme,844,390);
  await capture('stats-desktop','/stats?view=players',theme,1440,1000);
 }
 assert.equal(errors.length,0,JSON.stringify(errors));
 const bad=captures.filter(x=>x.status!==200||x.error||x.documentWidth>x.width);
 if(captures.length)writeFileSync(out+'/browser-checks.json',JSON.stringify({dataset:'Isolated synthetic PGlite data; real production Next.js application; Chromium; reduced motion',captures,pageErrors:errors},null,2));
 assert.deepEqual(bad.map(x=>({label:x.label,theme:x.theme,width:x.width,error:x.error,documentWidth:x.documentWidth,status:x.status})),[]);
 const scoringControls=captures.filter(c=>c.label.startsWith('121-scoring')).flatMap(c=>c.controls.filter(b=>b.tag==='BUTTON'||(b.tag==='A'&&b.name.includes('Pause'))).map(b=>({label:c.label,theme:c.theme,width:c.width,name:b.name,x:b.x,w:b.w,h:b.h})));
 assert.deepEqual(scoringControls.filter(b=>b.h<44||b.x<0||b.x+b.w>b.width+1),[], '121 score controls must remain usable and inside the viewport');
 if(captures.length)console.log('BROWSER_SCREEN_PASS',captures.length);else console.log('BROWSER_MATRIX_SKIPPED');
 await verifyResultScreens({browser,runtime,out});
 await verifyJourneys({browser,runtime,out});
}finally{await browser.close();}
}finally{await runtime.stop();}
