import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const out="league-investigation";
await mkdir(out,{recursive:true});
const browser=await chromium.launch();
const page=await browser.newPage();
const pending=[];
let serial=0;
const seen=new Set();
page.on("response",response=>{
 const req=response.request(), url=response.url();
 if(!["fetch","xhr","script"].includes(req.resourceType())) return;
 pending.push((async()=>{
  const body=await response.text().catch(()=>"");
  const n=serial++;
  await writeFile(out+"/"+n+".txt",url+"\n"+body);
  if(req.resourceType()==="script"){
   if(seen.has(url))return;seen.add(url);
   console.log("SCRIPT",url,"length",body.length);
   for(const term of ["entities.","point_adjust","deduction","adjustment","legs_for","standings","Monday Night League","West Green"]){
    let pos=body.indexOf(term),count=0;
    while(pos>=0&&count++<4){
     console.log("BUNDLE",term,body.slice(Math.max(0,pos-1200),Math.min(body.length,pos+3500)));
     pos=body.indexOf(term,pos+term.length);
    }
   }
  }else{
   console.log("REQUEST",req.method(),url,"status",response.status(),"query",new URL(url).search);
   try{
    const json=JSON.parse(body);
    const rows=Array.isArray(json)?json:Array.isArray(json?.data)?json.data:null;
    if(rows){
     console.log("STRUCTURE",url,"count",rows.length,"sample",JSON.stringify(rows[0]));
     const matches=rows.filter(row=>/West Green|Townend|Monday Night League 2/i.test(JSON.stringify(row)));
     console.log("MATCHES",url,JSON.stringify(matches).slice(0,22000));
    }else console.log("STRUCTURE",url,JSON.stringify(json,(key,value)=>/token|secret|password|email|phone/i.test(key)?"[redacted]":value).slice(0,1200));
   }catch{console.log("NONJSON",url,body.slice(0,100));}
  }
 })());
});
await page.goto("https://barnsley-darts-flow.base44.app/",{waitUntil:"networkidle",timeout:60000});
console.log("PAGE INITIAL",await page.locator("body").innerText());
console.log("CONTROLS",await page.locator("a,button").evaluateAll(els=>els.map(e=>({text:e.innerText,href:e.getAttribute("href")}))));
for(const label of [/^Leagues$/i,/Barnsley Townend Monday Night League 2/i,/^League Table$/i,/^Table$/i]){
 const locator=page.getByText(label);
 console.log("TRY CLICK",String(label),await locator.count());
 if(await locator.count()){
  await locator.first().click();
  await page.waitForTimeout(4000);
  console.log("PAGE AFTER",String(label),await page.locator("body").innerText());
  console.log("CONTROLS AFTER",await page.locator("a,button").evaluateAll(els=>els.map(e=>({text:e.innerText,href:e.getAttribute("href")}))));
 }
}
await page.screenshot({path:out+"/page.png",fullPage:true});
await Promise.allSettled(pending);
await browser.close();
