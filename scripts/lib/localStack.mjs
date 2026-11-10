// A self-contained copy of the application for browser checks: an in-memory
// PostgreSQL (PGlite) built from the migration chain, a small PostgREST-style
// adapter in front of it, and the production build of the app pointed at that
// adapter. No live data or credentials are involved.
import { PGlite } from '@electric-sql/pglite';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID, createHmac, createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const RPC_PARAMETERS = {
  wgd_drill_command: ['p_mode', 'p_session', 'p_team', 'p_revision', 'p_request', 'p_event', 'p_patch', 'p_player', 'p_player_patch'],
  wgd_score_snapshot: ['p_game', 'p_team', 'p_practice'],
  wgd_score_command_state: ['p_game', 'p_team', 'p_revision', 'p_request', 'p_practice', 'p_command', 'p_side', 'p_score', 'p_darts'],
  wgd_score_command: ['p_game', 'p_team', 'p_revision', 'p_request', 'p_practice', 'p_command', 'p_side', 'p_score', 'p_darts'],
  wgd_pin_locked: ['p_client'],
  wgd_pin_failed: ['p_client'],
  wgd_pin_succeeded: ['p_client'],
  wgd_set_current_season: ['p_team', 'p_season'],
  wgd_delete_fixture: ['p_team', 'p_fixture'],
  wgd_claim_ai: ['p_key'],
  wgd_release_ai: ['p_key']
};
const TABLES = new Set(['players', 'seasons', 'fixtures', 'games', 'scoring_events', 'practice_sessions', 'practice_games',
  'practice_events', 'game_121_sessions', 'game_121_turns', 'player_ai_insights']);
const at = (row, path) => path.split('.').reduce((value, k) => value?.[k], row);

export async function createDatabase() {
  const db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  for (const file of readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync('supabase/migrations/' + file, 'utf8'));
  }
  return db;
}

export const hashPin = (pin, salt = 'wgd-salt') => createHash('sha256').update(`${salt}:${pin}`).digest('hex');

/**
 * Start the adapter and the built application. `next build` must have run with
 * NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<adapterPort>.
 */
export async function startStack({ db, team, pinHash = 'performance-pin', appPort = 3100, adapterPort = 3101 }) {
  const secret = randomUUID(), key = 'local-stack-service-key', trace = [];
  const control = { loseNext: false };
  const adapter = createServer(async (req, res) => {
    const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    try {
      assert.equal(req.headers.authorization, 'Bearer ' + key);
      const url = new URL(req.url, 'http://localhost'), name = url.pathname.split('/').pop();
      if (url.pathname.includes('/rpc/')) {
        assert.ok(RPC_PARAMETERS[name], 'Unexpected RPC ' + name);
        let body = ''; for await (const chunk of req) body += chunk;
        const args = JSON.parse(body); trace.push({ rpc: name, game: args.p_game || args.p_session, request: args.p_request });
        const names = RPC_PARAMETERS[name];
        const result = (await db.query('select public.' + name + '(' + names.map((_, i) => '$' + (i + 1)).join(',') + ') result', names.map(k => args[k] ?? null))).rows[0].result;
        if (control.loseNext && (name === 'wgd_score_command_state' || name === 'wgd_drill_command')) {
          control.loseNext = false; await new Promise(r => setTimeout(r, 900));
          send(500, { code: 'XX000', message: 'Test connection interrupted after saving' });
        } else send(200, result);
        return;
      }
      assert.equal(req.method, 'GET', 'The adapter serves reads and RPCs only: ' + req.method + ' ' + name);
      assert.ok(TABLES.has(name), 'Unexpected table ' + name); trace.push({ table: name });
      let rows = (await db.query('select * from public.' + name)).rows;
      if (name === 'games' || name === 'fixtures' || name === 'practice_sessions' || name === 'game_121_sessions') {
        const players = (await db.query('select * from players')).rows;
        const fixtures = (await db.query('select * from fixtures')).rows;
        const seasons = (await db.query('select * from seasons')).rows;
        const games = (await db.query('select * from games')).rows;
        rows = rows.map(r => name === 'games' ? { ...r, players: players.find(p => p.id === r.west_green_player_id), fixtures: fixtures.find(f => f.id === r.fixture_id) } :
          name === 'fixtures' ? { ...r, seasons: seasons.find(s => s.id === r.season_id), games: games.filter(g => g.fixture_id === r.id) } :
          name === 'game_121_sessions' ? { ...r, player: players.find(p => p.id === r.player_id) } :
          { ...r, player_a: players.find(p => p.id === r.player_a_id), player_b: players.find(p => p.id === r.player_b_id) });
      }
      if (name === 'scoring_events' && (url.searchParams.get('select') || '').includes('games')) {
        const games = (await db.query('select * from games')).rows;
        rows = rows.map(r => ({ ...r, games: games.find(g => g.id === r.game_id) }));
      }
      for (const [column, value] of url.searchParams) {
        if (['select', 'order', 'limit', 'offset'].includes(column)) continue;
        if (value.startsWith('eq.')) rows = rows.filter(r => String(at(r, column)) === value.slice(3));
        else if (value.startsWith('in.(')) { const ids = value.slice(4, -1).split(','); rows = rows.filter(r => ids.includes(String(at(r, column)))); }
        else if (value === 'is.null') rows = rows.filter(r => at(r, column) == null);
        else throw new Error('Unsupported filter ' + column + '=' + value);
      }
      const orders = (url.searchParams.get('order') || '').split(',').filter(Boolean);
      rows.sort((a, b) => { for (const order of orders) { const [column, direction] = order.split('.'), av = at(a, column), bv = at(b, column); if (av !== bv) return (av > bv ? 1 : -1) * (direction === 'desc' ? -1 : 1); } return 0; });
      const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || rows.length);
      rows = rows.slice(offset, offset + limit);
      if ((req.headers.accept || '').includes('vnd.pgrst.object')) {
        if (rows.length !== 1) send(406, { code: 'PGRST116', message: 'Expected one row', details: rows.length + ' rows' });
        else send(200, rows[0]);
      } else send(200, rows);
    } catch (error) { send(400, { code: 'P0001', message: error.message }); }
  });
  await new Promise(resolve => adapter.listen(adapterPort, '127.0.0.1', resolve));
  const app = spawn('npm', ['run', 'start', '--', '-p', String(appPort)], {
    detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, SESSION_SECRET: secret, TEAM_ID: team, PIN_HASH: pinHash, PIN_SALT: 'wgd-salt', SUPABASE_SERVICE_ROLE_KEY: key, NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${adapterPort}`, ANTHROPIC_API_KEY: '' }
  });
  app.stdout.on('data', data => process.stdout.write(data)); app.stderr.on('data', data => process.stderr.write(data));
  const baseUrl = `http://127.0.0.1:${appPort}`;
  for (let i = 0; i < 120; i++) { try { await fetch(baseUrl + '/pin'); break; } catch { await new Promise(r => setTimeout(r, 250)); } }
  return {
    baseUrl, trace, control,
    /** A valid session cookie, for checks that are not about signing in. */
    sessionCookie() {
      const payload = 'v1.' + (Math.floor(Date.now() / 1000) + 86400) + '.' + randomUUID();
      const signature = createHmac('sha256', secret).update(payload + ':' + team + ':' + pinHash).digest('hex');
      return { name: 'wgd_session', value: payload + '.' + signature, url: baseUrl, httpOnly: true };
    },
    async stop() {
      process.kill(-app.pid, 'SIGTERM'); app.stdout.destroy(); app.stderr.destroy(); app.unref();
      adapter.close();
    }
  };
}

/** Collect script errors and Content-Security-Policy violations from a page. */
export function watchPage(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && /Content Security Policy|Refused to/.test(m.text())) errors.push(m.text()); });
  return errors;
}
