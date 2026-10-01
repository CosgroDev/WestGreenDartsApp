import { leagueScoreSnapshot, practiceScoreSnapshot, missingSnapshotRPC } from "@/lib/scoreSnapshot";
it("restores both sides and turn from one ordered snapshot", () => {
  const raw = {meta:{west_green_starts:true,revision:2},events:[
    {thrower:"west_green",score:100,darts:3,remaining_after:401},
    {thrower:"opponent",score:60,darts:3,remaining_after:441}
  ]};
  const result=leagueScoreSnapshot(raw);
  expect(result.remaining).toBe(401);
  expect(result.meta.opponentRemaining).toBe(441);
  expect(result.meta.activeSide).toBe("west");
  expect(result.meta.revision).toBe(2);
  expect(result.visits).toHaveLength(1);
});
it("practice state keeps its configured start and excludes bust points", () => {
  const result=practiceScoreSnapshot({meta:{practice_sessions:{start_score:40}},events:[
    {thrower:"player_a",score:60,darts:3,remaining_after:40,is_bust:true}
  ]});
  expect(result.remainingA).toBe(40);
  expect(result.remainingB).toBe(40);
  expect(result.statsA.threeDartAvg).toBe(0);
});
it("falls back only for the specifically missing snapshot function", () => {
  expect(missingSnapshotRPC({code:"PGRST202",message:"wgd_score_snapshot missing"},"wgd_score_snapshot")).toBe(true);
  expect(missingSnapshotRPC({code:"42501",message:"permission denied"},"wgd_score_snapshot")).toBe(false);
  expect(missingSnapshotRPC({code:"PGRST202",message:"unrelated missing"},"wgd_score_snapshot")).toBe(false);
});
