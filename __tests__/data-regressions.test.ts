import { supabaseServer } from "@/lib/supabaseServer";
import { getDashboardStatistics } from "@/data/dashboard";
import { getGamesForFixture } from "@/data/games";
import { getPlayerCards } from "@/data/stats";
import { get121PlayerStats } from "@/data/game121";
import { getPlayerForm } from "@/data/form";
import { getSeasonToDate } from "@/data/seasonSummary";
jest.mock("@/lib/supabaseServer", () => ({supabaseServer: jest.fn()}));

function database(tables: Record<string, any[]>, requests: string[] = []) {
  (supabaseServer as jest.Mock).mockResolvedValue({from: (table: string) => {
    let rows=[...(tables[table]??[])];
    const orders: { key: string; asc: boolean }[] = [];
    const value=(row:any,key:string)=>key.split('.').reduce((v,k)=>v?.[k],row);
    const q:any={
      select:()=>q,
      eq:(key:string,v:any)=>{rows=rows.filter(r=>value(r,key)===v);return q;},
      in:(key:string,vs:any[])=>{rows=rows.filter(r=>vs.includes(value(r,key)));return q;},
      order:(key:string, options?: {ascending?: boolean})=>{orders.push({key,asc:options?.ascending!==false});return q;},
      range:async(from:number,to:number)=>{requests.push(table);rows.sort((a,b)=>{for(const o of orders){const av=value(a,o.key),bv=value(b,o.key);if(av===bv||av==null||bv==null)continue;return (av<bv?-1:1)*(o.asc?1:-1);}return 0;});return {data:rows.slice(from,to+1),error:null};}
    };return q;
  }});
}
it("aggregates real player cards without awarding bust points or opponent visits", async () => {
  database({players:[{id:'p',name:'Player',active:true}],games:[{id:'g',west_green_player_id:'p',status:'completed',deleted:false,winner:'west_green'}],
    scoring_events:[
      {id:1,game_id:'g',thrower:'west_green',score:180,darts:3,remaining_after:321,is_bust:false,is_deleted:false},
      {id:2,game_id:'g',thrower:'west_green',score:180,darts:3,remaining_after:141,is_bust:false,is_deleted:false},
      {id:3,game_id:'g',thrower:'west_green',score:180,darts:3,remaining_after:141,is_bust:true,is_deleted:false},
      {id:4,game_id:'g',thrower:'west_green',score:141,darts:3,remaining_after:0,is_bust:false,is_checkout:true,is_deleted:false},
      {id:5,game_id:'g',thrower:'opponent',score:180,darts:3,remaining_after:321,is_bust:false,is_deleted:false}
    ]});
  const [card]=await getPlayerCards();
  expect(card.three_dart_avg).toBe(125.25);
  expect(card.one_eighty).toBe(2);
  expect(card.high_finish).toBe(141);
  expect(card.checkout_pct).toBe(50);
  expect(card.matches_played).toBe(1);
  expect(card.scoring_visits).toBe(4);
  expect(card.checkout_attempts).toBe(2);
  expect(card.checkout_hits).toBe(1);
  expect(card.first_nine_legs).toBe(1);
  expect(card.recorded_wins).toBe(0);
});
it("reports achieved 121 targets and leaves best checkout empty for a session with no finishes", async () => {
  database({game_121_sessions:[
    {id:'a',player_id:'p',player:{name:'Player'},status:'abandoned',current_checkout:122},
    {id:'b',player_id:'q',player:{name:'Other'},status:'abandoned',current_checkout:121}],
    game_121_turns:[{session_id:'a',result:'locked',checkout:121,turn_number:1}]});
  const rows=await get121PlayerStats();
  expect(rows.find(r=>r.player_id==='p')?.best_checkout).toBe(121);
  expect(rows.find(r=>r.player_id==='q')?.best_checkout).toBeNull();
});
it("counts repeated pairings as separate matches in form and season results", async () => {
  const games=Array.from({length:12},(_,i)=>({id:`g${i}`,match_id:`m${Math.floor(i/2)}`,fixture_id:'f',west_green_player_id:'p',opponent_player:'Other',
    status:'completed',deleted:false,winner:i<6?'west_green':'opponent',created_at:`2026-09-08T19:${String(i).padStart(2,'0')}:00Z`,
    fixtures:{id:'f',season_id:'s',opponent:'Visitors',home:true,starts_at:'2026-09-08T19:00:00Z'}}));
  database({players:[{id:'p',name:'Player',active:true}],games});
  const [card] = await getPlayerCards("s");
  expect(card.matches_played).toBe(6);
  expect(card.legs_played).toBe(12);
  expect((await getPlayerForm())[0].matches).toHaveLength(6);
  const season=await getSeasonToDate('s');
  expect(season?.completedFixtures).toBe(1);
  expect(season?.fixtures[0]).toMatchObject({matchWins:3,matchLosses:3,result:'draw'});
});

it("First 9 follows throw order even when later visits have lower IDs", async () => {
  database({players:[{id:"p",name:"Player",active:true}],
    games:[{id:"g",west_green_player_id:"p",status:"completed",deleted:false,winner:"west_green"}],
    scoring_events:Array.from({length:6},(_,i)=>({id:6-i,game_id:"g",throw_index:i*2+1,thrower:"west_green",
      score:i<3?100:26,darts:3,remaining_after:501,is_deleted:false,is_bust:false}))});
  expect((await getPlayerCards())[0].first_nine_avg).toBe(100);
});
it("one dashboard dataset supplies all summaries with one paginated event sequence", async () => {
  const requests:string[]=[];
  const games=Array.from({length:12},(_,i)=>({id:"g"+i,match_id:"m"+Math.floor(i/2),fixture_id:"f",
    west_green_player_id:"p",opponent_player:"Other",status:"completed",deleted:false,winner:"west_green",
    created_at:"2026-09-28T20:00:00Z",fixtures:{id:"f",season_id:"s",opponent:"Visitors",home:true,starts_at:"2026-09-28T20:00:00Z"}}));
  database({players:[{id:"p",name:"Player",active:true}],games,
    scoring_events:games.map((g,i)=>({id:i+1,game_id:g.id,throw_index:1,thrower:"west_green",score:60,darts:3,is_deleted:false,is_bust:false,remaining_after:441}))},requests);
  const result=await getDashboardStatistics("s");
  expect(result.players[0].legs_won).toBe(12);
  expect(result.team.legs_won).toBe(12);
  expect(result.playerForm[0].matches).toHaveLength(6);
  expect(result.seasonToDate?.completedFixtures).toBe(1);
  expect(requests.filter(t=>t==="scoring_events")).toHaveLength(2); // data + terminal empty page
  expect(requests.filter(t=>t==="games")).toHaveLength(2);
  expect(requests.filter(t=>t==="players")).toHaveLength(2);
});
it("fixture stats fetch all legs' events in a batch", async () => {
  const requests:string[]=[];
  const games=Array.from({length:12},(_,i)=>({id:"g"+i,fixture_id:"f",deleted:false,created_at:"2026-09-28T20:00:00Z"}));
  database({games,scoring_events:games.map((g,i)=>({id:i+1,game_id:g.id,throw_index:1,thrower:"west_green",
    score:100,darts:3,is_deleted:false,is_bust:false,remaining_after:401}))},requests);
  expect(await getGamesForFixture("f")).toHaveLength(12);
  expect(requests.filter(t=>t==="scoring_events")).toHaveLength(2);
});
it("season form excludes earlier seasons and incomplete two-leg matches", async () => {
  database({players:[{id:"p",name:"Player",active:true}],games:[
    ...[0,1].map(i=>({id:"old"+i,match_id:"old",fixture_id:"o",west_green_player_id:"p",status:"completed",deleted:false,winner:"west_green",created_at:"2025-01-01",fixtures:{season_id:"old"}})),
    {id:"partial",match_id:"partial",fixture_id:"f",west_green_player_id:"p",status:"completed",deleted:false,winner:"west_green",created_at:"2026-09-28",fixtures:{season_id:"s"}},
    ...[0,1].map(i=>({id:"new"+i,match_id:"new",fixture_id:"f",west_green_player_id:"p",status:"completed",deleted:false,winner:"opponent",created_at:"2026-09-28",fixtures:{season_id:"s"}}))]});
  expect((await getPlayerForm("s"))[0].matches).toHaveLength(1);
  expect((await getPlayerForm("s"))[0].matches[0].result).toBe("L");
});
