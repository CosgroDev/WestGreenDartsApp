import { chromium } from "playwright";
import ts from "typescript";
import assert from "node:assert/strict";
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
   const start=text.indexOf("function nD("),end=text.indexOf("const F=",start);
   console.log("SOURCE_CALCULATION",url,text.slice(start,end));
   await writeFile("league-investigation/source-calculation.txt",url+"\n"+text.slice(start,end));
   const at=text.indexOf('fe.entities.Fixture.list("-updated_date",500)');
   console.log("SOURCE_REQUESTS",text.slice(Math.max(0,at-200),at+350));
  })());
 }
 const entity=new URL(url).pathname.split("/").pop();
 if(!["League","Team","Fixture"].includes(entity))return;
 pending.push((async()=>{
  captured[entity]=await response.json();
  const headers=await req.allHeaders();
  console.log("PUBLIC_BROWSER_REQUEST",req.method(),url,response.status(),JSON.stringify({
   authorizationPresent:!!headers.authorization,cookiePresent:!!headers.cookie,
   appIdHeader:headers["x-app-id"]??headers["base44-app-id"]??null
  }));
 })());
});
await page.goto("https://barnsley-darts-flow.base44.app/",{waitUntil:"networkidle",timeout:60000});
await page.getByRole("heading",{name:TARGET_LEAGUE,exact:true}).waitFor();
const heading=page.getByRole("heading",{name:TARGET_LEAGUE,exact:true});
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
const leagues=captured.League,teams=captured.Team,fixtures=captured.Fixture;
assert.ok(leagues&&teams&&fixtures,"Required browser data was not captured");
const league=leagues.find(l=>l.name.toLowerCase()===TARGET_LEAGUE.toLowerCase());
const computed=calculateLeagueStandings(league.id,teams,fixtures);
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
await browser.close();
