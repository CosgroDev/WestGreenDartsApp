import { webcrypto } from "node:crypto";
import { issueSession, verifySession, SESSION_SECONDS } from "@/lib/session";
import { csv } from "@/lib/csv";
import { allRows, rowsForIds } from "@/lib/database";
import { canFinishFrom, buildLegStats } from "@/lib/scoringUtils";
import { matchKey } from "@/lib/matchKey";

describe("signed team sessions", () => {
  const saved = { ...process.env };
  beforeAll(() => { Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true }); });
  beforeEach(() => { process.env.SESSION_SECRET = "test-secret"; process.env.TEAM_ID = "team-a"; process.env.PIN_HASH = "pin-hash"; });
  afterAll(() => { process.env = saved; });
  it("accepts issued tokens and rejects fabricated cookies", async () => {
    const token = await issueSession();
    expect(await verifySession(token)).toBe(true);
    expect(await verifySession("anything")).toBe(false);
    expect(await verifySession(token.slice(0,-1) + (token.endsWith("0") ? "1" : "0"))).toBe(false);
  });
  it("expires sessions and invalidates them when the team or PIN changes", async () => {
    const now=Date.now(), token=await issueSession(now);
    expect(await verifySession(token, now + SESSION_SECONDS*1000)).toBe(false);
    process.env.TEAM_ID="team-b";
    expect(await verifySession(token)).toBe(false);
    process.env.TEAM_ID="team-a"; process.env.PIN_HASH="rotated";
    expect(await verifySession(token)).toBe(false);
  });
});

it("validates checkout dart counts rather than just the target", () => {
  expect(canFinishFrom(100,1)).toBe(false);
  expect(canFinishFrom(100,2)).toBe(true);
  expect(canFinishFrom(170,2)).toBe(false);
  expect(canFinishFrom(170,3)).toBe(true);
  expect(canFinishFrom(169,3)).toBe(false);
  expect(canFinishFrom(40,1.5)).toBe(false);
});
it("does not award a score band for a bust", () => {
  const stats=buildLegStats([{score:180,darts:3,remaining_after:40,is_bust:true,is_checkout:false}]);
  expect(stats.buckets.t180).toBe(0);
  expect(stats.threeDartAvg).toBe(0);
});
it("escapes commas, quotes and line breaks in exported cells", () => {
  expect(csv([["Name","Notes"],['Smith, Joe','He said "yes"\nNew line']])).toBe('Name,Notes\r\n"Smith, Joe","He said ""yes""\nNew line"');
});
it("keeps distinct matches between the same players separate", () => {
  const base={fixture_id:"f",west_green_player_id:"p",opponent_player:"Other"};
  expect(matchKey({...base,match_id:"m1"})).not.toBe(matchKey({...base,match_id:"m2"}));
});
it("loads all pages even when the database caps each below 500", async () => {
  const source=Array.from({length:1203},(_,id)=>({id}));
  const query=()=>({range:async (from:number,to:number)=>({data:source.slice(from,Math.min(to+1,from+100)),error:null})});
  expect((await allRows(query)).data).toEqual(source);
});
it("does not silently return partial history on a failed page", async () => {
  let page=0;
  await expect(allRows(()=>({range:async ()=>++page===1 ? {data:[{id:1}],error:null} : {data:null,error:{message:"offline"}}}))).rejects.toThrow("offline");
});
it("chunks large ID filters as well as paginating their results", async () => {
  const ids=Array.from({length:251},(_,i)=>String(i));
  const sizes:number[]=[];
  const result=await rowsForIds(ids, chunk=>{sizes.push(chunk.length); return {range:async(from:number)=>({data:from ? [] : chunk,error:null})};});
  expect(result).toEqual(ids);
  expect(Math.max(...sizes)).toBe(100);
});
