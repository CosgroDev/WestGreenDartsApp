import { chromium } from "playwright";
import ts from "typescript";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
await mkdir("league-investigation",{recursive:true});
const code=ts.transpileModule(await readFile("src/lib/liveLeague.ts","utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
await writeFile("league-investigation/liveLeague.mjs",code);
const {getWestGreenLeagueContext,calculateLeagueStandings,BASE44_API,TARGET_LEAGUE}=await import("../league-investigation/liveLeague.mjs");
const insightCode=ts.transpileModule(await readFile("src/lib/leagueInsights.ts","utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace('"./liveLeague"','"./liveLeague.mjs"');
await writeFile("league-investigation/leagueInsights.mjs",insightCode);
const {getLeagueInsights,buildLeagueInsights}=await import("../league-investigation/leagueInsights.mjs");
const browser=await chromium.launch();
const page=await browser.newPage();
const captured={};
const pending=[];
page.on("response",response=>{
 const req=response.request(),url=response.url();
 if(req.resourceType()==="script"&&url.includes("/assets/index-")){
  pending.push((async()=>{
   const text=await response.text();
   const home=text.indexOf("function sD(");
   console.log("HOME_SOURCE", text.slice(home, text.indexOf("function oD(",home)));
   const start=text.indexOf("function nD("),end=text.indexOf("const F=",start);
   console.log("SOURCE_CALCULATION",url,text.slice(start,end));
   await writeFile("league-investigation/source-calculation.txt",url+"\n"+text.slice(start,end));
   const at=text.indexOf('fe.entities.Fixture.list("-updated_date",500)');
   console.log("SOURCE_REQUESTS",text.slice(Math.max(0,at-200),at+350));
  })());
 }
 const entity=new URL(url).pathname.split("/").pop();
 if(!["League","Team","Fixture","WeekDate"].includes(entity))return;
 pending.push((async()=>{
  if (captured[entity]) return;
  captured[entity]=await response.json();
  const headers=await req.allHeaders();
  console.log("PUBLIC_BROWSER_REQUEST",req.method(),url,response.status(),JSON.stringify({
   authorizationPresent:!!headers.authorization,cookiePresent:!!headers.cookie,
   appIdHeader:headers["x-app-id"]??headers["base44-app-id"]??null
  }));
 })());
});
await page.goto("https://barnsley-darts-flow.base44.app/",{waitUntil:"networkidle",timeout:60000});
await page.getByRole("heading",{name:new RegExp("^"+TARGET_LEAGUE+"$","i")}).waitFor();
const heading=page.getByRole("heading",{name:new RegExp("^"+TARGET_LEAGUE+"$","i")});
const table=heading.locator("xpath=ancestor::div[.//table][1]").locator("table");
const rendered=await table.locator("tbody tr").evaluateAll(rows=>rows.map(row=>{
 const c=[...row.querySelectorAll("td")];
 return {position:Number(c[0].innerText),team:c[1].innerText.trim(),played:Number(c[2].innerText),legsFor:Number(c[3].innerText),legsAgainst:Number(c[4].innerText),points:Number(c[5].querySelector("span").innerText)};
}));
await page.getByText("West Green",{exact:true}).first().click();
await page.waitForTimeout(2000);
console.log("TEAM_FIXTURES_NAVIGATION",page.url());
console.log("TEAM_FIXTURES_TEXT",(await page.locator("body").innerText()).slice(0,1400));
await page.getByRole("link",{name:"League Tables",exact:true}).click();
await page.waitForTimeout(1000);
await Promise.allSettled(pending);
const leagues=captured.League,teams=captured.Team,fixtures=captured.Fixture,weekDates=captured.WeekDate;
assert.ok(leagues&&teams&&fixtures&&weekDates,"Required browser data was not captured");
const league=leagues.find(l=>l.name.toLowerCase()===TARGET_LEAGUE.toLowerCase());
const computed=calculateLeagueStandings(league.id,teams,fixtures,weekDates);
assert.deepEqual(computed.map(({position,team,played,legsFor,legsAgainst,points})=>({position,team,played,legsFor,legsAgainst,points})),rendered);
console.log("BROWSER_PARITY_PASS",rendered.length,"rows");
console.log("RAW_WEST_GREEN",JSON.stringify(teams.find(t=>t.name==="West Green"),(key,value)=>["code","created_by","created_by_id"].includes(key)?undefined:value));
console.log("RAW_WEST_FIXTURE",JSON.stringify(fixtures.find(f=>f.played&&(f.home_team_name==="West Green"||f.away_team_name==="West Green")),(key,value)=>["created_by","created_by_id"].includes(key)?undefined:value));
console.log("LEAGUE_RECORD",JSON.stringify({id:league.id,name:league.name}));
console.log("ADJUSTMENT_PARITY",JSON.stringify(computed.filter(r=>r.deduction!==0)));
const result=await getWestGreenLeagueContext();
assert.deepEqual(result.standings.map(({position,team,points})=>({position,team,points})),
 rendered.filter(row=>row.position>=Math.max(1,result.targetPosition-3)&&row.position<=result.targetPosition+3).map(({position,team,points})=>({position,team,points})));
console.log("ANONYMOUS_SERVER_FETCH_PARITY_PASS");
const insights=await getLeagueInsights();
const fromBrowser=buildLeagueInsights({league,teams,fixtures,weekDates,checkedAt:insights.checkedAt,source:insights.source});
assert.deepEqual(insights,fromBrowser);
assert.deepEqual(insights.teams.map(({position,team,points})=>({position,team,points})),rendered.map(({position,team,points})=>({position,team,points})));
console.log("LIVE_INSIGHTS_PARITY_PASS",JSON.stringify({
 results:insights.results.length,teams:insights.teams.length,west:insights.teams.find(t=>t.teamId===insights.targetId),
 forecasts:insights.forecasts,validation:insights.validation,omitted:insights.omittedResults,
 projection:insights.projection,coverageVerified:insights.coverageVerified,remainingMatches:insights.remainingMatches,
 adjustedStrength:insights.adjustedStrength,scheduleStrength:insights.scheduleStrength
}));
if(insights.projection){
 const p=insights.projection;
 assert.equal(p.table.length,rendered.length);
 assert.equal(p.table.reduce((s,r)=>s+r.remaining,0),insights.remainingMatches*2);
 assert.ok(Math.abs(p.table.reduce((s,r)=>s+r.additionalLegs,0)-insights.remainingMatches*insights.matchLegs)<1e-7);
 const sourceRemaining=fixtures.filter(f=>f.league_id===league.id&&!f.played&&
  !weekDates.find(w=>w.league_id===league.id&&w.week===f.week)?.tournament_name&&
  computed.some(t=>t.teamId===f.home_team_id)&&computed.some(t=>t.teamId===f.away_team_id)&&f.home_team_id!==f.away_team_id);
 assert.equal(insights.remainingMatches,sourceRemaining.length);
 assert.equal(p.target.remaining,sourceRemaining.filter(f=>f.home_team_id===insights.targetId||f.away_team_id===insights.targetId).length);
 for(const row of p.table) assert.ok(Math.abs(row.points-(row.legsFor-row.deduction))<1e-7);
 console.log("LIVE_SEASON_PROJECTION_AND_LEG_TOTALS_PASS",JSON.stringify({
  target:p.target,positionRange:p.positionRange,pointsRange:p.pointsRange,
  distribution:p.distribution,coverageVerified:insights.coverageVerified,remainingMatches:insights.remainingMatches
 }));
}
await writeFile("league-investigation/live-insights.json",JSON.stringify(insights,null,2));
console.log("LIVE_CONTEXT",JSON.stringify(result,null,2));
await writeFile("league-investigation/live-result.json",JSON.stringify(result,null,2));
await writeFile("league-investigation/rendered-standings.json",JSON.stringify(rendered,null,2));
// Exercise the application's real route and mobile dashboard with a temporary
// signed local test session. No production credentials or database are used.
const testSecret=crypto.randomUUID();
const env={...process.env,SESSION_SECRET:testSecret,TEAM_ID:"league-smoke",PIN_HASH:"league-smoke"};
const server=spawn("npm",["run","start","--","-p","3100"],{env,detached:true,stdio:["ignore","pipe","pipe"]});
server.stdout.on("data",chunk=>console.log("LOCAL_APP",String(chunk).trim()));
server.stderr.on("data",chunk=>console.log("LOCAL_APP_ERROR",String(chunk).trim()));
try {
 let ready=false;
 for(let attempt=0;attempt<30;attempt++){
  try { const r=await fetch("http://localhost:3100/pin"); if(r.ok){ready=true;break;} } catch {}
  await new Promise(resolve=>setTimeout(resolve,500));
 }
 assert.ok(ready,"Local production server did not become ready");
 const payload="v1."+String(Math.floor(Date.now()/1000)+30*24*60*60)+"."+crypto.randomUUID();
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(testSecret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const signed=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(payload+":league-smoke:league-smoke"));
 const cookie=payload+"."+Array.from(new Uint8Array(signed),b=>b.toString(16).padStart(2,"0")).join("");
 const unauth=await fetch("http://localhost:3100/api/league-snapshot",{redirect:"manual"});
 assert.ok([302,303,307,308].includes(unauth.status),"Snapshot route must require a signed session");
 const response=await fetch("http://localhost:3100/api/league-snapshot",{headers:{Cookie:"wgd_session="+cookie}});
 assert.equal(response.status,200,"Application snapshot route must succeed");
 const appResult=await response.json();
 const shape=rows=>rows.map(({position,team,points,target})=>({position,team,points,target}));
 assert.deepEqual(shape(appResult.standings),shape(result.standings));
 console.log("APPLICATION_API_PARITY_PASS");
 const local=await browser.newContext({viewport:{width:390,height:844}});
 await local.addCookies([{name:"wgd_session",value:cookie,domain:"localhost",path:"/"}]);
 const dashboard=await local.newPage();
 await dashboard.goto("http://localhost:3100/dashboard",{waitUntil:"networkidle"});
 const panel=dashboard.locator('section[aria-labelledby="league-snapshot-title"]');
 await panel.locator("tbody tr").first().waitFor();
 const panelRows=await panel.locator("tbody tr").evaluateAll(rows=>rows.map(row=>{
  const c=[...row.querySelectorAll("td,th")];
  return {position:Number(c[0].innerText),team:c[1].innerText.trim(),points:Number(c[2].innerText)};
 }));
 assert.deepEqual(panelRows,result.standings.map(({position,team,points})=>({position,team,points})));
 assert.ok(await panel.locator("tbody tr").filter({hasText:"West Green"}).getAttribute("class").then(c=>c.includes("bg-emerald-50")));
 assert.equal(await dashboard.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,"Mobile dashboard must not overflow horizontally");
 await panel.screenshot({path:"league-investigation/application-mobile-snapshot.png"});
 console.log("MOBILE_DASHBOARD_PARITY_PASS",JSON.stringify(panelRows));
 const unauthInsights=await fetch("http://localhost:3100/api/league-insights",{redirect:"manual"});
 assert.ok([302,303,307,308].includes(unauthInsights.status));
 const insightResponse=await fetch("http://localhost:3100/api/league-insights",{headers:{Cookie:"wgd_session="+cookie}});
 assert.equal(insightResponse.status,200);
 const servedInsights=await insightResponse.json();
 assert.deepEqual(servedInsights.teams,insights.teams);
 assert.deepEqual(servedInsights.forecasts,insights.forecasts);
 assert.deepEqual(servedInsights.projection,insights.projection);
 const manualResponse=await fetch("http://localhost:3100/api/league-insights?refresh=1",{headers:{Cookie:"wgd_session="+cookie}});
 assert.equal(manualResponse.status,200);
 const manualData=await manualResponse.json();
 assert.ok(Date.parse(manualData.checkedAt)>Date.parse(servedInsights.checkedAt),"Manual refresh must await fresh upstream data");
 const sharedResponse=await fetch("http://localhost:3100/api/league-snapshot",{headers:{Cookie:"wgd_session="+cookie}});
 assert.equal((await sharedResponse.json()).checkedAt,manualData.checkedAt,"Both pages must share refreshed source data");
 console.log("MANUAL_REFRESH_AND_SHARED_CACHE_PASS");
 await dashboard.getByRole("link",{name:"League insights →",exact:true}).click();
 await dashboard.getByRole("heading",{name:"How we compare",exact:true}).waitFor();
 await dashboard.getByRole("heading",{name:"End-of-season projection",exact:true}).waitFor();
 await dashboard.getByRole("heading",{name:"Remaining fixture legs analysis",exact:true}).waitFor();
 if(insights.projection){
  await dashboard.getByText("Projected final league table",{exact:true}).click();
  const projectedTable=dashboard.getByRole("table",{name:"Projected final league table",exact:true});
  assert.equal(await projectedTable.locator("tbody tr").count(),rendered.length);
  const rows=await projectedTable.locator("tbody tr").evaluateAll(rows=>rows.map(row=>{
   const c=[...row.querySelectorAll("th,td")];return {position:Number(c[0].innerText.split(".")[0]),points:Number(c[4].innerText)};
  }));
  assert.deepEqual(rows,insights.projection.table.map(r=>({position:r.position,points:Number(r.points.toFixed(1))})));
  console.log("MOBILE_PROJECTED_TABLE_PARITY_PASS");
 }
 const refreshed=dashboard.waitForResponse(r=>r.url().includes("/api/league-insights?refresh=1")&&r.status()===200);
 await dashboard.getByRole("button",{name:"Refresh",exact:true}).click();
 await refreshed;
 console.log("MANUAL_REFRESH_BUTTON_PASS");
 await dashboard.locator("#insight-opponent").selectOption(insights.opponents.at(-1).teamId);
 await dashboard.getByRole("heading",{name:"Meetings this season",exact:true}).waitFor();
 assert.equal(await dashboard.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,"Mobile insights must not overflow");
 await dashboard.screenshot({path:"league-investigation/application-mobile-insights.png",fullPage:true});
 console.log("MOBILE_INSIGHTS_AND_AUTHENTICATED_API_PASS");
 await dashboard.setViewportSize({width:1280,height:900});
 await dashboard.screenshot({path:"league-investigation/application-desktop-insights.png",fullPage:true});
 await local.close();
} finally {
 if (server.pid) {
  try { process.kill(-server.pid,"SIGTERM"); } catch {}
 }
 server.stdout.destroy();
 server.stderr.destroy();
 server.unref();
 await browser.close();
}
