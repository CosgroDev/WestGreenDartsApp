import { chromium } from "playwright";
import ts from "typescript";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
await mkdir("league-investigation",{recursive:true});
const code=ts.transpileModule(await readFile("src/lib/liveLeague.ts","utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
await writeFile("league-investigation/liveLeague.mjs",code);
const {getWestGreenLeagueContext,calculateLeagueStandings,BASE44_API,TARGET_LEAGUE}=await import("../league-investigation/liveLeague.mjs");
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
console.log("LIVE_CONTEXT",JSON.stringify(result,null,2));
await writeFile("league-investigation/live-result.json",JSON.stringify(result,null,2));
await writeFile("league-investigation/rendered-standings.json",JSON.stringify(rendered,null,2));
// Exercise the application's real route and mobile dashboard with a temporary
// signed local test session. No production credentials or database are used.
const testSecret=crypto.randomUUID();
const env={...process.env,SESSION_SECRET:testSecret,TEAM_ID:"league-smoke",PIN_HASH:"league-smoke"};
const server=spawn("npm",["run","start","--","-p","3100"],{env,stdio:["ignore","pipe","pipe"]});
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
  return {position:Number(c[0].innerText),team:c[1].innerText.replace(" (West Green)","").trim(),points:Number(c[2].innerText)};
 }));
 assert.deepEqual(panelRows,result.standings.map(({position,team,points})=>({position,team,points})));
 assert.ok(await panel.locator("tbody tr").filter({hasText:"West Green"}).getAttribute("class").then(c=>c.includes("bg-emerald-50")));
 assert.equal(await dashboard.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,"Mobile dashboard must not overflow horizontally");
 await panel.screenshot({path:"league-investigation/application-mobile-snapshot.png"});
 console.log("MOBILE_DASHBOARD_PARITY_PASS",JSON.stringify(panelRows));
 await local.close();
} finally {
 server.kill("SIGTERM");
 await browser.close();
}
