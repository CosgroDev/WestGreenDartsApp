import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
process.on("uncaughtException", (error) => {
  console.error(
    error.message,
    error.detail ?? "",
    error.where ?? "",
    error.internalQuery ?? "",
  );
  process.exit(1);
});

const db = new PGlite();
await db.exec(
  "create role anon; create role authenticated; create role service_role bypassrls;",
);
await db.exec(readFileSync("supabase/schema.sql", "utf8"));
for (const folder of readdirSync("supabase/migrations", {
  withFileTypes: true,
}).filter((x) => x.isDirectory())) {
  for (const file of readdirSync(`supabase/migrations/${folder.name}`).sort()) {
    if (file.endsWith(".sql"))
      await db.exec(
        readFileSync(`supabase/migrations/${folder.name}/${file}`, "utf8"),
      );
  }
}
const migration = readFileSync(
  "supabase/migrations/20260908193204_audit_scoring_and_access_fixes.sql",
  "utf8",
);
await db.exec(migration);
await db.exec(migration);
const snapshots = readFileSync(
  "supabase/migrations/20261001090000_scoring_snapshots.sql",
  "utf8",
);
await db.exec(snapshots);
await db.exec(snapshots);

const migrationFiles = readdirSync("supabase/migrations")
  .filter(
    (n) =>
      /^[0-9]+.*\.sql$/.test(n) && n > "20261001090000_scoring_snapshots.sql",
  )
  .sort();
for (const file of migrationFiles) {
  const sql = readFileSync(`supabase/migrations/${file}`, "utf8");
  await db.exec(sql);
  await db.exec(sql);
}
const team = randomUUID(),
  player = randomUUID();
await db.query("insert into teams(id,name)values($1,$2)", [
  team,
  "Practice test",
]);
await db.query("insert into players(id,team_id,name)values($1,$2,$3)", [
  player,
  team,
  "Player",
]);
async function drill(
  mode,
  id,
  rev,
  event,
  patch,
  who = null,
  pp = null,
  request = randomUUID(),
) {
  return (
    await db.query(
      "select wgd_drill_command($1,$2,$3,$4,$5,$6,$7,$8,$9) result",
      [mode, id, team, rev, request, event, patch, who, pp],
    )
  ).rows[0].result;
}
const c = randomUUID();
await db.query(
  "insert into checkout_practice_sessions(id,team_id,current_target)values($1,$2,100)",
  [c, team],
);
const req = randomUUID();
await drill(
  "checkout",
  c,
  0,
  { success: true, darts_used: 2 },
  { current_target: 40 },
  null,
  null,
  req,
);
await drill(
  "checkout",
  c,
  0,
  { success: true, darts_used: 2 },
  { current_target: 40 },
  null,
  null,
  req,
);
assert.equal(
  (
    await db.query(
      "select count(*)::int n from checkout_practice_attempts where session_id=$1",
      [c],
    )
  ).rows[0].n,
  1,
);
await drill("checkout", c, 1, null, { status: "completed" });
await drill("checkout", c, 2, null, { command: "undo" });
assert.equal(
  (
    await db.query(
      "select status from checkout_practice_sessions where id=$1",
      [c],
    )
  ).rows[0].status,
  "in_progress",
);
const undoReq = randomUUID();
await drill("checkout", c, 3, null, { command: "undo" }, null, null, undoReq);
await drill("checkout", c, 3, null, { command: "undo" }, null, null, undoReq);
assert.deepEqual(
  (
    await db.query(
      "select current_target,attempt_index,revision from checkout_practice_sessions where id=$1",
      [c],
    )
  ).rows[0],
  { current_target: 100, attempt_index: 0, revision: 4 },
);
await assert.rejects(
  drill(
    "checkout",
    c,
    3,
    { success: false, darts_used: 0 },
    { current_target: 40 },
  ),
  /changed on another device/,
);
console.log(
  "Checkout retry deduplication, end undo, target restoration, monotonic revision and stale rejection pass.",
);
const challenge = randomUUID();
await db.query(
  "insert into game_121_sessions(id,team_id,current_checkout,remaining)values($1,$2,170,170)",
  [challenge, team],
);
await drill(
  "121",
  challenge,
  0,
  { score: 170, remaining_after: 0, is_bust: false, result: "won" },
  {
    base_checkout: 170,
    current_checkout: 170,
    current_turn: 1,
    remaining: 0,
    status: "won",
    completed_at: new Date().toISOString(),
  },
);
await drill("121", challenge, 1, null, { command: "undo" });
assert.deepEqual(
  (
    await db.query(
      "select status,remaining,base_checkout from game_121_sessions where id=$1",
      [challenge],
    )
  ).rows[0],
  { status: "in_progress", remaining: 170, base_checkout: 121 },
);
assert.equal(
  (
    await db.query(
      "select count(*)::int n from game_121_turns where session_id=$1",
      [challenge],
    )
  ).rows[0].n,
  0,
);
console.log(
  "121 final-win undo restores locked base, remaining score and attempt state.",
);
const ds = randomUUID(),
  a = randomUUID(),
  b = randomUUID();
await db.query(
  "insert into doubles_practice_sessions(id,team_id)values($1,$2)",
  [ds, team],
);
await db.query(
  "insert into doubles_practice_players(id,session_id,player_id,throw_order)values($1,$2,$3,0),($4,$2,$3,1)",
  [a, ds, player, b],
);
const attempt = (who, rev, slot) =>
  drill(
    "doubles",
    ds,
    rev,
    { round_index: 0, target: 1, phase: "sequence", dart_hit: 1, points: 3 },
    { current_slot: slot },
    who,
    {
      round_index: 1,
      current_target: 2,
      phase: "sequence",
      score: 3,
      hits: 1,
      first_dart_hits: 1,
    },
  );
await attempt(a, 0, 1);
await drill("doubles", ds, 1, null, { status: "completed" });
assert.deepEqual(
  (
    await db.query(
      "select status,end_after_round from doubles_practice_sessions where id=$1",
      [ds],
    )
  ).rows[0],
  { status: "in_progress", end_after_round: true },
);
await attempt(b, 2, 0);
assert.equal(
  (
    await db.query("select status from doubles_practice_sessions where id=$1", [
      ds,
    ])
  ).rows[0].status,
  "completed",
);
await drill("doubles", ds, 3, null, { command: "undo" });
assert.deepEqual(
  (
    await db.query(
      "select current_slot,status,end_after_round from doubles_practice_sessions where id=$1",
      [ds],
    )
  ).rows[0],
  { current_slot: 1, status: "in_progress", end_after_round: true },
);
assert.equal(
  (
    await db.query("select score from doubles_practice_players where id=$1", [
      b,
    ])
  ).rows[0].score,
  0,
);
await drill("doubles", ds, 4, null, { command: "undo" });
assert.equal(
  (
    await db.query(
      "select end_after_round from doubles_practice_sessions where id=$1",
      [ds],
    )
  ).rows[0].end_after_round,
  false,
);
console.log(
  "Doubles equal-round finish and undo of final visit/end intent restore full counters, target and throwing order.",
);
const fixture = randomUUID(),
  mid = randomUUID(),
  first = randomUUID();
await db.query(
  "insert into fixtures(id,team_id,starts_at,home,opponent)values($1,$2,now(),true,$3)",
  [fixture, team, "Visitors"],
);
await db.query(
  "insert into games(id,team_id,fixture_id,match_id,west_green_player_id,opponent_player,west_green_starts)values($1,$2,$3,$4,$5,$6,true)",
  [first, team, fixture, mid, player, "Visitor"],
);
async function score(
  id,
  rev,
  command,
  score = 0,
  request = randomUUID(),
  practice = false,
) {
  return (
    await db.query(
      "select wgd_score_command_state($1,$2,$3,$4,$5,$6,'west_green',$7,3) result",
      [id, team, rev, request, practice, command, score],
    )
  ).rows[0].result;
}
await score(first, 0, "record", 180);
await score(first, 1, "record", 180);
await score(first, 2, "record", 141);
const next = (await score(first, 3, "new_leg")).next_game_id;
const undoNext = randomUUID();
const reopened = await score(next, 0, "undo", 0, undoNext);
assert.equal(reopened.state.meta.id, first);
assert.equal(reopened.state.meta.status, "in_progress");
const replayed = await score(next, 0, "undo", 0, undoNext);
assert.equal(replayed.state.meta.id, first);
assert.equal(replayed.state.meta.revision, reopened.state.meta.revision);
assert.equal(
  (await db.query("select deleted from games where id=$1", [next])).rows[0]
    .deleted,
  true,
);
console.log(
  "Empty second-leg undo reopens previous checkout, redirects canonical state and safely retries after response loss.",
);
const ps = randomUUID(),
  pg = randomUUID();
await db.query(
  "insert into practice_sessions(id,team_id,solo_mode,start_score)values($1,$2,true,40)",
  [ps, team],
);
await db.query(
  "insert into practice_games(id,session_id,leg_index)values($1,$2,1)",
  [pg, ps],
);
await assert.rejects(
  db.query(
    "select wgd_score_command_state($1,$2,0,$3,true,'record','player_b',20,3)",
    [pg, team, randomUUID()],
  ),
  /solo session/,
);
const endReq = randomUUID();
await db.query("select wgd_end_practice($1,$2,0,$3,false)", [pg, team, endReq]);
await db.query("select wgd_end_practice($1,$2,0,$3,false)", [pg, team, endReq]);
assert.equal(
  (await db.query("select status from practice_sessions where id=$1", [ps]))
    .rows[0].status,
  "cancelled",
);
await db.query("select wgd_end_practice($1,$2,1,$3,true)", [
  pg,
  team,
  randomUUID(),
]);
assert.equal(
  (await db.query("select status from practice_sessions where id=$1", [ps]))
    .rows[0].status,
  "in_progress",
);

// Practice creates its next leg automatically; undo from that empty leg must
// recover through a deleted successor even if the response is lost.
const ps2 = randomUUID(),
  pg1 = randomUUID();
await db.query(
  "insert into practice_sessions(id,team_id,legs_to_play,start_score)values($1,$2,2,40)",
  [ps2, team],
);
await db.query(
  "insert into practice_games(id,session_id,leg_index)values($1,$2,1)",
  [pg1, ps2],
);
await db.query(
  "select wgd_score_command_state($1,$2,0,$3,true,'record','player_a',40,1)",
  [pg1, team, randomUUID()],
);
const pgNext = (
  await db.query(
    "select id from practice_games where session_id=$1 and leg_index=2",
    [ps2],
  )
).rows[0].id;
const undoPracticeRequest = randomUUID();
const practiceUndone = await score(
  pgNext,
  0,
  "undo",
  0,
  undoPracticeRequest,
  true,
);
assert.equal(practiceUndone.state.meta.id, pg1);
const practiceReplay = await score(
  pgNext,
  0,
  "undo",
  0,
  undoPracticeRequest,
  true,
);
assert.equal(
  practiceReplay.state.meta.revision,
  practiceUndone.state.meta.revision,
);
const legacy = randomUUID();
await db.query(
  "insert into checkout_practice_sessions(id,team_id,current_target,attempt_index)values($1,$2,40,1)",
  [legacy, team],
);
await db.query(
  "insert into checkout_practice_attempts(session_id,target,darts_used,success)values($1,100,2,true)",
  [legacy],
);
await drill("checkout", legacy, 0, null, { command: "undo" });
assert.equal(
  (
    await db.query(
      "select current_target from checkout_practice_sessions where id=$1",
      [legacy],
    )
  ).rows[0].current_target,
  100,
);
await assert.rejects(
  db.query("select wgd_drill_command($1,$2,$3,4,$4,null,$5,null,null)", [
    "checkout",
    c,
    randomUUID(),
    randomUUID(),
    { command: "undo" },
  ]),
  /Session not found/,
);
// An undo storage failure rolls back event deletion, snapshot consumption and
// revision change together, preserving the exact request for retry.
await drill(
  "checkout",
  c,
  4,
  { success: true, darts_used: 2 },
  { current_target: 40 },
);
await db.exec(
  "create function reject_undo() returns trigger language plpgsql as $$ begin if new.current_target=100 then raise exception 'Simulated undo failure'; end if; return new; end $$;create trigger reject_undo before update on checkout_practice_sessions for each row execute function reject_undo();",
);
const failRequest = randomUUID();
await assert.rejects(
  drill("checkout", c, 5, null, { command: "undo" }, null, null, failRequest),
  /Simulated undo failure/,
);
assert.equal(
  (
    await db.query(
      "select count(*)::int n from checkout_practice_attempts where session_id=$1",
      [c],
    )
  ).rows[0].n,
  1,
);
assert.equal(
  (
    await db.query(
      "select revision from checkout_practice_sessions where id=$1",
      [c],
    )
  ).rows[0].revision,
  5,
);
await db.exec("drop trigger reject_undo on checkout_practice_sessions");
await drill(
  "checkout",
  c,
  5,
  null,
  { command: "undo" },
  null,
  null,
  failRequest,
);
console.log(
  "Practice empty-successor retry, legacy session correction, cross-team denial and transactional undo-failure recovery pass.",
);
await db.exec("set role anon");
await assert.rejects(
  db.query("select * from wgd_drill_history"),
  /permission denied/,
);
await assert.rejects(
  drill("checkout", c, 6, null, { command: "undo" }),
  /permission denied/,
);
await db.exec("reset role");
console.log(
  "Solo side protection, early-end retry/undo, anonymous command denial pass.",
);
await db.close();
