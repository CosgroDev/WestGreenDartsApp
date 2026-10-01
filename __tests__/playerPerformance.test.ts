import type { PlayerCard } from "../src/data/stats";
import {
  PERFORMANCE_METRICS, adjustPerformanceMetric, performancePercentile, buildPerformanceLeaderboard,
} from "../src/lib/playerPerformance";

function player(name:string, overrides:Partial<PlayerCard>={}):PlayerCard {
  return {
    player_id:name,name,legs_played:12,legs_won:6,three_dart_avg:50,first_nine_avg:60,
    checkout_pct:20,twenty_six:4,one_eighty:1,high_finish:100,sixty_plus:30,hundred_plus:12,
    hundred_forty_plus:3,darts_per_leg_won:30,total_darts:300,matches_played:6,
    scoring_visits:100,checkout_attempts:20,checkout_hits:4,first_nine_legs:12,recorded_wins:6,
    ...overrides,
  };
}
describe("sample-adjusted season performance",()=>{
  it("defines an explicit 100-point budget",()=>{
    expect(PERFORMANCE_METRICS.reduce((total,m)=>total+m.weight,0)).toBe(100);
  });
  it("reproduces the published shrinkage example and gives more evidence more influence",()=>{
    expect(adjustPerformanceMetric(100,4,50,12)).toBe(62.5);
    expect(adjustPerformanceMetric(100,40,50,12)).toBeGreaterThan(62.5);
    expect(adjustPerformanceMetric(0,4,50,12)).toBe(37.5);
  });
  it("gives tied measures equal midrank percentiles and a lone player 50",()=>{
    expect(performancePercentile(60,[40,60,60,80])).toBe(50);
    expect(performancePercentile(60,[60])).toBe(50);
    expect(performancePercentile(null,[40,80])).toBe(50);
    expect(performancePercentile(60,[])).toBe(50);
    expect(performancePercentile(80,[40,80])).toBe(75);
  });
  it("ranks stronger measured performance first and sums the visible contributions",()=>{
    const model=buildPerformanceLeaderboard([
      player("Typical"),player("Stronger",{legs_won:9,three_dart_avg:65,first_nine_avg:75,checkout_hits:10,hundred_plus:25}),
    ]);
    expect(model.ratings[0].playerId).toBe("Stronger");
    expect(model.ratings[0].rank).toBe(1);
    expect(model.ratings[0].score).toBeCloseTo(75);
    expect(model.ratings[1].score).toBeCloseTo(25);
    for(const r of model.ratings)expect(r.score).toBe(r.components.reduce((sum,c)=>sum+c.contribution,0));
  });
  it("keeps a one-leg perfect record provisional behind qualified players",()=>{
    const model=buildPerformanceLeaderboard([
      player("One leg",{legs_played:1,legs_won:1,scoring_visits:9,total_darts:27,first_nine_legs:1}),
      player("Established"),
    ]);
    expect(model.ratings[0].playerId).toBe("Established");
    const provisional=model.ratings[1];
    expect(provisional.qualified).toBe(false);expect(provisional.rank).toBeNull();
    expect(provisional.reasons).toEqual(expect.arrayContaining([expect.stringContaining("6 completed legs"),expect.stringContaining("30 recorded visits")]));
    expect(model.referenceCount).toBe(1);expect(model.usingProvisionalReference).toBe(false);
  });
  it("keeps a recorded zero distinct from missing evidence",()=>{
    const model=buildPerformanceLeaderboard([
      player("Zero",{checkout_hits:0,checkout_pct:0}),
      player("Missing",{checkout_attempts:0,checkout_hits:0,checkout_pct:null}),
    ]);
    const zero=model.ratings.find(r=>r.playerId==="Zero")!,missing=model.ratings.find(r=>r.playerId==="Missing")!;
    expect(zero.qualified).toBe(true);
    expect(zero.components.find(c=>c.id==="finishing")!.raw).toBe(0);
    expect(missing.qualified).toBe(false);
    expect(missing.components.find(c=>c.id==="finishing")!.raw).toBeNull();
    expect(missing.components.find(c=>c.id==="finishing")!.percentile).toBe(50);
  });
  it("uses exposure-weighted team baselines",()=>{
    const model=buildPerformanceLeaderboard([
      player("Short",{legs_played:6,legs_won:6,total_darts:90,three_dart_avg:80,first_nine_legs:6}),
      player("Long",{legs_played:24,legs_won:6,total_darts:360,three_dart_avg:40,first_nine_legs:24}),
    ]);
    const components=model.ratings[0].components;
    expect(components.find(c=>c.id==="results")!.baseline).toBe(40);
    expect(components.find(c=>c.id==="average")!.baseline).toBe(48);
  });
  it("shares positions on equal scores and has deterministic display order",()=>{
    const model=buildPerformanceLeaderboard([player("B"),player("A"),player("C")]);
    expect(model.ratings.map(r=>[r.playerId,r.rank,r.score])).toEqual([["A",1,50],["B",1,50],["C",1,50]]);
    expect(buildPerformanceLeaderboard([player("C"),player("A"),player("B")])).toEqual(model);
  });
  it("does not award separate points for attendance or single achievements",()=>{
    const base=player("A");
    const changed=player("A",{matches_played:99,high_finish:170,one_eighty:20,hundred_forty_plus:50,darts_per_leg_won:9,twenty_six:0,sixty_plus:100});
    expect(buildPerformanceLeaderboard([base,player("B")])).toEqual(buildPerformanceLeaderboard([changed,player("B")]));
  });
  it("awards no official positions before players qualify",()=>{
    const model=buildPerformanceLeaderboard([player("Early A",{legs_played:2,legs_won:1}),player("Early B",{legs_played:4,legs_won:3})]);
    expect(model.usingProvisionalReference).toBe(true);expect(model.referenceCount).toBe(2);
    expect(model.ratings.every(r=>r.rank===null)).toBe(true);
    expect(model.ratings.every(r=>r.score!>=0&&r.score!<=100)).toBe(true);
  });
  it("handles an empty cohort and a player with no observations",()=>{
    expect(buildPerformanceLeaderboard([])).toEqual({ratings:[],referenceCount:0,usingProvisionalReference:true});
    const model=buildPerformanceLeaderboard([player("No results",{legs_played:0,legs_won:0,total_darts:0,three_dart_avg:null,first_nine_legs:0,first_nine_avg:null,scoring_visits:0,checkout_attempts:0})]);
    expect(model.referenceCount).toBe(0);expect(model.ratings[0].score).toBeNull();
    expect(model.ratings[0].components.every(c=>c.percentile===50)).toBe(true);
  });
});
