// Isolated UI verification: synthetic data, real application and real SQL.
// Generated test credentials replace all production credentials; remote fetches are blocked.
import { PGlite } from '@electric-sql/pglite';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync, mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { randomUUID, createHmac, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function startUIRuntime() {

const root = process.cwd(), scratch = mkdtempSync(join(tmpdir(), 'wgd-ui-ux-'));
mkdirSync(scratch, { recursive: true });
const db = new PGlite(), team = randomUUID(), season = randomUUID(), oldSeason = randomUUID();
const secret = randomUUID(), key = 'synthetic-audit-service-key', pin = createHash('sha256').update('wgd-salt:1234').digest('hex');
const context = { appUrl: 'http://localhost:3100', adapterUrl: 'http://127.0.0.1:3101', synthetic: true, team, season, oldSeason, players: [], fixtures: [], completedGames: [] };
const trace = []; context.pin_input='1234'; let fault=null;
await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
await db.exec(readFileSync(root + '/supabase/schema.sql', 'utf8'));
for (const folder of readdirSync(root + '/supabase/migrations', { withFileTypes: true }).filter(x => x.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
  for (const file of readdirSync(root + '/supabase/migrations/' + folder.name).sort()) {
    if (file.endsWith('.sql')) await db.exec(readFileSync(root + '/supabase/migrations/' + folder.name + '/' + file, 'utf8'));
  }
}
for (const file of readdirSync(root + '/supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(root + '/supabase/migrations/' + file, 'utf8'));
}
const insert = async (table, row) => {
  const fields = Object.keys(row);
  await db.query(`insert into ${table}(${fields.join(',')}) values(${fields.map((_, i) => '$' + (i + 1)).join(',')})`, fields.map(k => row[k]));
};
await db.exec('begin');
await insert('teams', { id: team, name: 'West Green — synthetic audit' });
await insert('seasons', { id: season, team_id: team, name: '26/27', is_current: true });
await insert('seasons', { id: oldSeason, team_id: team, name: '25/26', is_current: false });
const names = ['Alex Carter', 'Jamie Ellis', 'Morgan Reed', 'Chris Taylor', 'Sam Patel', 'Lee Jones', 'Charlie Brown', 'Casey Wilson', 'Drew Roberts', 'Harper Shaw', 'Jordan Evans', 'Riley Davies', 'Robin Woods', 'Alexander Montgomery-Johnson the Third', 'Finley Brooks'];
for (const [index, name] of names.entries()) {
  const id = randomUUID(); context.players.push({ id, name, active: index !== 14 });
  await insert('players', { id, team_id: team, name, active: index !== 14, dart_model: index % 2 ? '24g tungsten' : '22g tungsten', stem_length: 'Medium', flight_type: 'Standard', registration_date: '2025-09-01' });
}
context.firstPlayer = context.players[0].id;
context.longNamePlayer = context.players[13].id;
const addFixture = async (date, opponent, home = true, targetSeason = season, notes = null) => {
  const id = randomUUID(); await insert('fixtures', { id, team_id: team, season_id: targetSeason, starts_at: date, opponent, home, venue: home ? 'West Green Club' : 'Visitors Social Club', notes });
  context.fixtures.push({ id, date, opponent, home }); return id;
};
const eventCounts = new Map();
const event = async (table, id, score, remaining, thrower, throwIndex, checkout = false, date = '2026-09-28T19:45:00Z', session = null) => {
  const nextIndex = (eventCounts.get(id) || 0) + 1; eventCounts.set(id, nextIndex);
  const row = { team_id: team, game_id: id, thrower, throw_index: nextIndex, score, darts: checkout ? 2 : 3, remaining_after: remaining, is_checkout: checkout, created_at: date };
  if (session) row.session_id = session;
  await insert(table, row);
};
const scoreSeries = [
  [100, 60, 100, 60, 60, 61, 60],
  [60, 45, 100, 60, 60, 76, 100],
  [140, 100, 60, 41, 60, 100],
  [180, 100, 100, 81, 40],
  [26, 60, 60, 60, 60, 100, 95, 40],
  [100, 100, 100, 100, 61, 40],
];
for (let week = 0; week < 12; week++) {
  const date = new Date(Date.UTC(2026, 7, 3 + week * 4, 19)).toISOString();
  const fixture = await addFixture(date, ['Oakfield Arms', 'Central Club', 'Riverside Tavern', 'Crown & Anchor', 'Northside Social', 'The Kingfisher'][week % 6], week % 2 === 0);
  for (let slot = 0; slot < 6; slot++) {
    const index = (week * 6 + slot) % 14;
    const match = randomUUID(), westWins = (index + week) % 4 !== 0;
    for (let leg = 0; leg < 2; leg++) {
      const game = randomUUID(), winner = westWins ? 'west_green' : 'opponent';
      await insert('games', { id: game, team_id: team, fixture_id: fixture, match_id: match, match_position: slot+1, west_green_player_id: context.players[index].id, opponent_player: `Guest ${index + 1}`, west_green_starts: leg % 2 === 0, status: 'completed', winner, darts_thrown: 20, created_at: date, completed_at: date });
      context.completedGames.push(game);
      const values = scoreSeries[(index + week + leg) % scoreSeries.length];
      let left = 501;
      for (const [visit, score] of values.entries()) {
        const last = visit === values.length - 1;
        left -= score;
        // Losing players stop before their checkout; winner records a finish.
        if (!westWins && last) break;
        await event('scoring_events', game, score, left, 'west_green', visit + 1, last, date);
      }
      let guestLeft = 501;
      const guestScores = [100, 100, 100, 100, 61, 40];
      for (const [visit, score] of guestScores.entries()) {
        if (westWins && visit === guestScores.length - 1) break;
        guestLeft -= score;
        await event('scoring_events', game, score, guestLeft, 'opponent', visit + 1, !westWins && visit === guestScores.length - 1, date);
      }
    }
  }
}
context.completedGame = context.completedGames[0];
const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
const nextWeek = new Date(new Date(today + 'T12:00:00Z').getTime() + 7*86400000).toISOString().slice(0,10);
context.futureFixture = await addFixture(nextWeek + 'T19:00:00Z', 'Southbank Darts & Social Club', false, season, 'Arrive at 7:30pm. Bring team shirts.');
context.unfinishedFixture = await addFixture(new Date(new Date(today + 'T12:00:00Z').getTime() - 3*86400000).toISOString(), 'Unfinished Visitors');
context.liveFixture = await addFixture(today + 'T19:00:00Z', 'The Red Lion', true, season, 'Synthetic active fixture for the audit.');
context.liveGame = randomUUID(); context.firstGame = context.liveGame;
await insert('games', { id: context.liveGame, team_id: team, fixture_id: context.liveFixture, match_id: randomUUID(), match_position: 1, west_green_player_id: context.players[0].id, opponent_player: 'Taylor Guest', west_green_starts: true, created_at: '2026-10-05T20:00:00Z' });
// Opponent has 40 remaining; last visit is West, leaving 141, so opponent is next.
await event('scoring_events', context.liveGame, 180, 321, 'west_green', 1, false, '2026-10-05T20:00:01Z');
await event('scoring_events', context.liveGame, 180, 321, 'opponent', 1, false, '2026-10-05T20:00:02Z');
await event('scoring_events', context.liveGame, 180, 141, 'west_green', 2, false, '2026-10-05T20:00:03Z');
await event('scoring_events', context.liveGame, 180, 141, 'opponent', 2, false, '2026-10-05T20:00:04Z');
await event('scoring_events', context.liveGame, 0, 141, 'west_green', 3, false, '2026-10-05T20:00:05Z');
await event('scoring_events', context.liveGame, 101, 40, 'opponent', 3, false, '2026-10-05T20:00:06Z');
await event('scoring_events', context.liveGame, 0, 141, 'west_green', 4, false, '2026-10-05T20:00:07Z');
await addFixture('2025-12-15T20:00:00Z', 'Oldfield Club', false, oldSeason);
context.practiceSession = randomUUID(); context.practiceGame = randomUUID();
await insert('practice_sessions', { id: context.practiceSession, team_id: team, player_a_id: context.players[0].id, player_b_id: context.players[13].id, start_score: 501, legs_to_play: 3 });
await insert('practice_games', { id: context.practiceGame, session_id: context.practiceSession, leg_index: 1 });
await event('practice_events', context.practiceGame, 100, 401, 'player_a', 1, false, '2026-10-07T20:00:01Z', context.practiceSession);
await event('practice_events', context.practiceGame, 60, 441, 'player_b', 1, false, '2026-10-07T20:00:02Z', context.practiceSession);
for (let index = 0; index < 7; index++) {
  const session = randomUUID(), game = randomUUID();
  await insert('practice_sessions', { id: session, team_id: team, player_a_id: context.players[index].id, player_b_id: context.players[index + 1].id, start_score: 501, legs_to_play: 1, status: 'completed', completed_at: '2026-10-01T20:00:00Z' });
  await insert('practice_games', { id: game, session_id: session, leg_index: 1, status: 'completed', winner: 'player_a', darts_thrown: 20, completed_at: '2026-10-01T20:00:00Z' });
  let left = 501;
  for (const [visit, score] of scoreSeries[index % scoreSeries.length].entries()) { left -= score; await event('practice_events', game, score, left, 'player_a', visit + 1, left === 0, '2026-10-01T20:00:00Z', session); }
}
context.session121 = randomUUID();
await insert('game_121_sessions', { id: context.session121, team_id: team, player_id: context.players[13].id });
for (let index = 0; index < 6; index++) {
  const id = randomUUID();
  await insert('game_121_sessions', { id, team_id: team, player_id: context.players[index].id, base_checkout: 125 + index, current_checkout: 126 + index, remaining: 40, current_turn: 2, status: 'abandoned', completed_at: '2026-10-01T20:00:00Z' });
  await insert('game_121_turns', { session_id: id, checkout: 121, base_checkout: 121, turn_number: 1, score: 121, remaining_before: 121, remaining_after: 0, result: 'locked' });
}
context.doublesSession = randomUUID();
await insert('doubles_practice_sessions', { id: context.doublesSession, team_id: team });
for (let index = 0; index < 4; index++) await insert('doubles_practice_players', { id: randomUUID(), session_id: context.doublesSession, player_id: context.players[index === 3 ? 13 : index].id, throw_order: index });
for (let index = 0; index < 6; index++) {
  const id = randomUUID(), playerRow = randomUUID();
  await insert('doubles_practice_sessions', { id, team_id: team, status: 'completed', completed_at: '2026-10-01T20:00:00Z' });
  await insert('doubles_practice_players', { id: playerRow, session_id: id, player_id: context.players[index].id, throw_order: 0, score: 15 + index, hits: 5, first_dart_hits: 2 });
  for (let visit = 0; visit < 8; visit++) await insert('doubles_practice_attempts', { session_id: id, session_player_id: playerRow, round_index: visit, target: [10, 6, 16, 8][visit % 4], phase: 'sequence', dart_hit: (index + visit) % 4, points: 2 });
}
context.checkoutSession = randomUUID();
await insert('checkout_practice_sessions', { id: context.checkoutSession, team_id: team, player_id: context.players[13].id, current_target: 100 });
for (let index = 0; index < 6; index++) {
  const id = randomUUID();
  await insert('checkout_practice_sessions', { id, team_id: team, player_id: context.players[index].id, current_target: 40, status: 'completed', completed_at: '2026-10-01T20:00:00Z' });
  for (let visit = 0; visit < 8; visit++) await insert('checkout_practice_attempts', { session_id: id, target: [40, 60, 100, 121][visit % 4], darts_used: visit % 3 ? 3 : 0, success: visit % 3 !== 0 });
}

await db.exec('commit');
const verification = (await db.query('select wgd_score_snapshot($1,$2,false) result', [context.liveGame, team])).rows[0].result;
assert.equal(verification.events.filter(e => e.thrower === 'west_green').at(-1).remaining_after, 141);
assert.equal(verification.events.filter(e => e.thrower === 'opponent').at(-1).remaining_after, 40);
assert.equal(verification.events.at(-1).thrower, 'west_green');
const parameters = {
  wgd_drill_command: ['p_mode', 'p_session', 'p_team', 'p_revision', 'p_request', 'p_event', 'p_patch', 'p_player', 'p_player_patch'],
  wgd_score_snapshot: ['p_game', 'p_team', 'p_practice'],
  wgd_score_command_state: ['p_game', 'p_team', 'p_revision', 'p_request', 'p_practice', 'p_command', 'p_side', 'p_score', 'p_darts'],
  wgd_score_command: ['p_game', 'p_team', 'p_revision', 'p_request', 'p_practice', 'p_command', 'p_side', 'p_score', 'p_darts']
};
const tables = new Set(['teams', 'players', 'seasons', 'fixtures', 'games', 'scoring_events', 'practice_sessions', 'practice_games', 'practice_events', 'game_121_sessions', 'game_121_turns', 'doubles_practice_sessions', 'doubles_practice_players', 'doubles_practice_attempts', 'checkout_practice_sessions', 'checkout_practice_attempts']);
const at = (row, path) => path.split('.').reduce((value, k) => value?.[k], row);
const hydrate = (name, rows, records) => rows.map(r => {
  const players = records.players, fixtures = records.fixtures, seasons = records.seasons, games = records.games;
  const practiceSession = s => s && ({ ...s, player_a: players.find(p => p.id === s.player_a_id) ?? null, player_b: players.find(p => p.id === s.player_b_id) ?? null });
  if (name === 'games') return { ...r, players: players.find(p => p.id === r.west_green_player_id) ?? null, fixtures: fixtures.find(f => f.id === r.fixture_id) ?? null };
  if (name === 'fixtures') return { ...r, seasons: seasons.find(s => s.id === r.season_id) ?? null, games: games.filter(g => g.fixture_id === r.id) };
  if (name === 'scoring_events') return { ...r, games: games.find(g => g.id === r.game_id) ?? null };
  if (name === 'practice_sessions') return practiceSession(r);
  if (name === 'practice_games') return { ...r, practice_sessions: practiceSession(records.practice_sessions.find(s => s.id === r.session_id)) ?? null };
  if (['game_121_sessions', 'checkout_practice_sessions', 'doubles_practice_players'].includes(name)) return { ...r, player: players.find(p => p.id === r.player_id) ?? null, doubles_practice_sessions: records.doubles_practice_sessions.find(s=>s.id===r.session_id) ?? null };
  if (name === 'doubles_practice_sessions') return {...r, players: records.doubles_practice_players.filter(p=>p.session_id===r.id).map(p=>({...p,player:players.find(x=>x.id===p.player_id)}))};
  return r;
});
const adapter = createServer(async (req, res) => {
  const send = (status, body, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(body)); };
  try {
    assert.equal(req.headers.authorization, 'Bearer ' + key);
    const url = new URL(req.url, context.adapterUrl), name = url.pathname.split('/').pop();
    if(fault?.table===name&&fault.count>0){fault.count--;return send(503,{message:'Synthetic read failure'});}
    if (url.pathname.includes('/rpc/')) {
      assert.ok(/^[a-z][a-z0-9_]+$/.test(name));
      let body = ''; for await (const chunk of req) body += chunk;
      const args = JSON.parse(body || '{}'); trace.push({rpc:name,game:args.p_game||args.p_session});
      const meta=(await db.query("select proargnames, proretset from pg_proc join pg_namespace on pg_namespace.oid=pronamespace where nspname='public' and proname=$1",[name])).rows[0];
      assert.ok(meta,'Unsupported local RPC '+name);
      const keys=Object.keys(args); assert.ok(keys.every(k=>meta.proargnames?.includes(k)));
      const values=keys.map(k=>args[k]);
      const result=await db.query('select to_jsonb(public.'+name+'('+keys.map((k,i)=>k+'=> $'+(i+1)).join(',')+')) result', values);
      if(fault?.rpc===name&&fault.count>0){fault.count--;return send(503,{message:'Synthetic response lost after commit'});}
      return send(200,meta.proretset?result.rows.map(r=>r.result):result.rows[0]?.result??null);
    }
    assert.ok(tables.has(name), 'Unsupported local table ' + name);
    if(req.method !== 'GET' && req.method !== 'HEAD') {
      let body=''; for await(const chunk of req) body+=chunk;
      const input=body?JSON.parse(body):{};
      const filters=[...url.searchParams].filter(([k])=>!['select','order','limit','offset','columns'].includes(k));
      const vals=[], clauses=filters.map(([k,v])=>{assert.ok(/^[a-z][a-z0-9_]*$/.test(k));assert.ok(v.startsWith('eq.'));vals.push(v.slice(3));return k+'=$'+vals.length;});
      const where=clauses.length?' where '+clauses.join(' and '):'';
      let rows;
      if(req.method==='POST') {
        rows=[];
        for(const row of (Array.isArray(input)?input:[input])) {
          const fields=Object.keys(row); assert.ok(fields.every(k=>/^[a-z][a-z0-9_]*$/.test(k)));
          const query='insert into public.'+name+'('+fields.join(',')+') values('+fields.map((_,i)=>'$'+(i+1)).join(',')+') returning *';
          rows.push(...(await db.query(query,fields.map(k=>row[k]))).rows);
        }
      } else if(req.method==='PATCH') {
        const fields=Object.keys(input);assert.ok(fields.every(k=>/^[a-z][a-z0-9_]*$/.test(k)));
        const assignments=fields.map(k=>{vals.push(input[k]);return k+'=$'+vals.length;});
        rows=(await db.query('update public.'+name+' set '+assignments.join(',')+where+' returning *',vals)).rows;
      } else if(req.method==='DELETE') {
        rows=(await db.query('delete from public.'+name+where+' returning *',vals)).rows;
      } else throw new Error('Unsupported local mutation');
      trace.push({mutation:req.method,table:name});
      return send(200,(req.headers.accept||'').includes('vnd.pgrst.object')?rows[0]:rows);
    }
    assert.ok(req.method==='GET'||req.method==='HEAD');
    assert.ok(tables.has(name), 'Unsupported local table ' + name); trace.push({ table: name });
    const records = {};
    for (const table of ['players', 'fixtures', 'seasons', 'games', 'practice_sessions', 'doubles_practice_players', 'doubles_practice_sessions']) records[table] = (await db.query('select * from public.' + table)).rows;
    let rows = hydrate(name, (await db.query('select * from public.' + name)).rows, records);
    for (const [column, value] of url.searchParams) {
      if (['select', 'order', 'limit', 'offset'].includes(column)) continue;
      if(column==='or') { const terms=value.slice(1,-1).split(',').map(x=>x.split('.')); rows=rows.filter(r=>terms.some(([k,op,v])=>op==='eq'&&String(at(r,k))===v)); }
      else if (value.startsWith('eq.')) rows = rows.filter(r => String(at(r, column)) === value.slice(3));
      else if (value.startsWith('ilike.')) { const pattern=value.slice(6).toLowerCase(); rows=rows.filter(r=>String(at(r,column)).toLowerCase()===pattern); }
      else if (value.startsWith('gte.')) rows=rows.filter(r=>String(at(r,column))>=value.slice(4));
      else if (value.startsWith('lte.')) rows=rows.filter(r=>String(at(r,column))<=value.slice(4));
      else if (value.startsWith('neq.')) rows = rows.filter(r => String(at(r, column)) !== value.slice(4));
      else if (value.startsWith('in.(')) { const values = value.slice(4, -1).split(','); rows = rows.filter(r => values.includes(String(at(r, column)))); }
      else if (value === 'is.null') rows = rows.filter(r => at(r, column) == null);
      else if (value === 'not.is.null') rows = rows.filter(r => at(r, column) != null);
      else if (value === 'is.true') rows = rows.filter(r => at(r, column) === true);
      else if (value === 'is.false') rows = rows.filter(r => at(r, column) === false);
      else throw new Error('Unsupported local filter ' + column + '=' + value);
    }
    const orders = (url.searchParams.get('order') || '').split(',').filter(Boolean);
    rows.sort((a, b) => { for (const order of orders) { const [column, direction] = order.split('.'), av = at(a, column), bv = at(b, column); if (av !== bv) return (av > bv ? 1 : -1) * (direction === 'desc' ? -1 : 1); } return 0; });
    const total = rows.length, range = req.headers.range?.match(/^(\d+)-(\d+)$/);
    const offset = Number(url.searchParams.get('offset') || range?.[1] || 0);
    const limit = Number(url.searchParams.get('limit') || (range ? Number(range[2]) - offset + 1 : total));
    rows = rows.slice(offset, offset + limit);
    if ((req.headers.accept || '').includes('vnd.pgrst.object')) {
      if (rows.length !== 1) return send(406, { code: 'PGRST116', message: 'Expected one row', details: rows.length + ' rows' });
      return send(200, rows[0]);
    }
    send(200, rows, { 'Content-Range': `${offset}-${offset + rows.length - 1}/${total}` });
  } catch (error) { console.error('ADAPTER_ERROR', error.message); send(400, { code: 'P0001', message: error.message }); }
});
await new Promise(resolve => adapter.listen(3101, '127.0.0.1', resolve));

// Synthetic external league feed and a remote-service guard, injected only in this runtime.
const leagueId = 'synthetic-league', leagueTeams = ['West Green', 'The Red Lion', 'Oakfield Arms', 'Central Club', 'Riverside Tavern', 'Crown & Anchor', 'Northside Social', 'Southbank Club', 'Oldfield Club', 'The Railway', 'Townend Club', 'The Kingfisher'].map((name, i) => ({ id: 'synthetic-team-' + i, name, league_id: leagueId, number: i + 1, points_deduction: 0 }));
const leagueFixtures = [];
for (let week = 1; week <= 14; week++) for (let pair = 0; pair < 6; pair++) {
  const home = (pair * 2 + week) % 12, away = (pair * 2 + week + 1) % 12;
  leagueFixtures.push({ id: `synthetic-fixture-${week}-${pair}`, league_id: leagueId, week, played: week <= 7, home_team_id: leagueTeams[home].id, away_team_id: leagueTeams[away].id, home_score: 3 + ((week + pair) % 5), away_score: 9 - (3 + ((week + pair) % 5)) });
}
const preload = `const originalFetch=globalThis.fetch;const feed=${JSON.stringify({ League: [{ id: leagueId, name: 'Barnsley Townend Monday Night League 2' }], Team: leagueTeams, Fixture: leagueFixtures, WeekDate: [] })};globalThis.fetch=async function(input,init){const url=new URL(typeof input==='string'?input:input.url||String(input));if(url.hostname==='barnsley-darts-flow.base44.app'){const entity=url.pathname.split('/').pop();if(feed[entity])return new Response(JSON.stringify(feed[entity]),{headers:{'content-type':'application/json'}});}if(!['localhost','127.0.0.1','::1'].includes(url.hostname))throw new Error('Remote services disabled in synthetic UI/UX audit: '+url.hostname);return originalFetch(input,init);};`;
writeFileSync(scratch + '/audit-preload.cjs', preload);
const app = spawn('npm', ['run', 'start', '--', '-p', '3100', '-H', '127.0.0.1'], { cwd: root, detached: true, env: { ...process.env, SESSION_SECRET: secret, TEAM_ID: team, PIN_HASH: pin, PIN_SALT: "wgd-salt", SUPABASE_SERVICE_ROLE_KEY: key, NEXT_PUBLIC_SUPABASE_URL: context.adapterUrl, ANTHROPIC_API_KEY: '', NODE_OPTIONS: '--require=' + scratch + '/audit-preload.cjs' }, stdio: ['ignore', 'pipe', 'pipe'] });
app.stdout.on('data', data => process.stdout.write(data)); app.stderr.on('data', data => process.stderr.write(data));
app.on('exit', (code, signal) => { console.error('AUDIT_APP_EXIT', code, signal); if (code) process.exit(code); });
const payload = 'v1.' + (Math.floor(Date.now() / 1000) + 86400) + '.' + randomUUID();
const signature = createHmac('sha256', secret).update(payload + ':' + team + ':' + pin).digest('hex');
context.cookie = { name: 'wgd_session', value: payload + '.' + signature, url: context.appUrl, httpOnly: true, sameSite: 'Lax' };
context.routes = { dashboard: '/dashboard', fixtures: '/fixtures', futureFixture: '/fixtures/' + context.futureFixture, liveFixture: '/fixtures/' + context.liveFixture, player: '/players/' + context.firstPlayer, longNamePlayer: '/players/' + context.longNamePlayer, match: '/matches/' + context.completedGame, leagueScoring: `/scoring?game=${context.liveGame}&fixture=${context.liveFixture}&home=1`, practiceScoring: `/practice/scoring?session=${context.practiceSession}&game=${context.practiceGame}`, game121Scoring: '/practice/121/scoring?session=' + context.session121, doublesScoring: '/practice/doubles/scoring?session=' + context.doublesSession, checkoutScoring: '/practice/checkout/scoring?session=' + context.checkoutSession };
writeFileSync(scratch + '/build-runtime-context.json', JSON.stringify(context, null, 2));
for (let attempt = 0; attempt < 120; attempt++) {
  try { const response = await fetch(context.appUrl + '/pin'); if (response.ok) break; } catch { }
  await new Promise(resolve => setTimeout(resolve, 250));
}
const stop = async () => {
  try { process.kill(-app.pid, 'SIGTERM'); } catch { /* Already stopped. */ }
  await new Promise(resolve => adapter.close(resolve));
  await db.close(); rmSync(scratch, {recursive: true, force: true});
};
return { rt: context, db, trace, stop,
  loseResponseOnce: rpc => { fault={rpc,count:1}; },
  failReads: table => { fault={table,count:100}; },
  clearFault: () => { fault=null; }
};
}
