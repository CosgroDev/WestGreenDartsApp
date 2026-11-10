// End-to-end smoke test of the production build against the local stack:
// access control, PIN lockout, sign-in, scoring a leg, undo, the dashboard and
// locking the device. Run `npm run build` first with
// NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3101, then `npm run test:smoke`.
import { createDatabase, startStack, watchPage, hashPin } from './lib/localStack.mjs';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

const db = await createDatabase();
const team = randomUUID(), player = randomUUID(), season = randomUUID(), fixture = randomUUID(), game = randomUUID(), match = randomUUID();
await db.query('insert into teams(id,name) values($1,$2)', [team, 'Smoke team']);
await db.query('insert into players(id,team_id,name) values($1,$2,$3)', [player, team, 'Smoke Player']);
await db.query('insert into seasons(id,team_id,name,is_current) values($1,$2,$3,true)', [season, team, '26/27']);
await db.query('insert into fixtures(id,team_id,season_id,starts_at,home,opponent) values($1,$2,$3,$4,true,$5)', [fixture, team, season, '2026-09-28T20:00:00Z', 'Smoke Visitors']);
await db.query('insert into games(id,team_id,fixture_id,match_id,west_green_player_id,opponent_player,west_green_starts) values($1,$2,$3,$4,$5,$6,true)', [game, team, fixture, match, player, 'Visitor One']);

mkdirSync('smoke-verification', { recursive: true });
const stack = await startStack({ db, team, pinHash: hashPin('4826') });
const url = path => stack.baseUrl + path;
const until = async (what, check, timeout = 15000) => {
  const end = Date.now() + timeout;
  for (;;) {
    if (await check()) return;
    if (Date.now() > end) throw new Error('Timed out waiting for: ' + what);
    await new Promise(r => setTimeout(r, 100));
  }
};
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
let browser, page;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  page = await context.newPage();
  const errors = watchPage(page);
  const key = digit => page.locator('.keypad-key').filter({ hasText: new RegExp('^' + digit + '$') });
  const type = async value => { for (const digit of String(value)) await key(digit).click(); };

  // 1. Nothing is reachable without a session.
  const api = await context.request.get(url('/api/exports/events'), { maxRedirects: 0 });
  assert.equal(api.status(), 401);
  const response = await page.goto(url('/dashboard'));
  assert.ok(page.url().includes('/pin'), 'Dashboard is not gated: ' + page.url());
  for (const header of ['content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy']) {
    assert.ok(response.headers()[header], 'Missing security header ' + header);
  }
  console.log('SMOKE_GATE_PASS: pages redirect to the PIN, the API answers 401, security headers are set');

  // 2. Wrong PINs lock the client out; the right PIN is refused while locked.
  const unlock = page.getByRole('button', { name: 'Unlock', exact: true });
  const alert = page.locator('p[role=alert]');
  for (let attempt = 1; attempt <= 5; attempt++) {
    await type('0000'); await unlock.click();
    await until('failed attempt ' + attempt, async () => (await one('select coalesce(max(failures),0)::int n from pin_attempts')).n === attempt);
    await until('keypad to unlock', async () => !(await key(1).isDisabled()));
  }
  await until('lockout message', async () => /Too many attempts/.test(await alert.textContent()));
  await type('4826'); await unlock.click();
  await until('refusal while locked', async () => /Too many attempts/.test(await alert.textContent()) && !(await key(1).isDisabled()));
  assert.ok(page.url().includes('/pin'), 'A locked-out client signed in');
  console.log('SMOKE_LOCKOUT_PASS: five wrong PINs lock the client, and the correct PIN is refused while locked');

  // 3. Once the lock expires the correct PIN signs in.
  await db.query("update pin_attempts set locked_until = now() - interval '1 second'");
  await type('4826'); await unlock.click();
  await page.waitForURL('**/dashboard');
  assert.equal((await one('select count(*)::int n from pin_attempts')).n, 0, 'Successful sign-in clears the attempt record');
  await page.getByRole('link', { name: 'Resume scoring', exact: true }).waitFor();
  console.log('SMOKE_SIGN_IN_PASS');

  // 4. Score a full leg: 180, 180, 141 against two opponent visits.
  await page.goto(url(`/scoring?game=${game}&fixture=${fixture}&home=1`));
  const enter = page.getByRole('button', { name: 'Enter score', exact: true });
  const revision = async id => (await one('select revision from games where id=$1', [id])).revision;
  const visit = async (score, expected) => {
    await until('keypad ready', async () => await enter.isVisible() && !(await enter.isDisabled()));
    await type(score); await enter.click();
    if (expected !== undefined) await until('revision ' + expected, async () => Number(await revision(game)) === expected);
  };
  await visit(180, 1); await visit(100, 2); await visit(180, 3); await visit(100, 4);
  await visit(141);
  await page.getByRole('button', { name: '3 darts', exact: true }).click();
  await until('leg one to complete', async () => (await one('select status from games where id=$1', [game])).status === 'completed');
  const first = await one('select winner, darts_thrown from games where id=$1', [game]);
  assert.equal(first.winner, 'west_green');
  await until('leg two to open', async () => (await one("select count(*)::int n from games where match_id=$1 and status='in_progress' and not deleted", [match])).n === 1);
  const legTwo = (await one("select id from games where match_id=$1 and status='in_progress' and not deleted", [match])).id;
  await page.waitForURL('**game=' + legTwo + '**');
  console.log('SMOKE_LEG_PASS: nine-dart leg recorded, winner stored, leg two opened');

  // 5. Undo removes the visit it was asked to remove.
  const live = async () => (await one('select count(*)::int n from scoring_events where game_id=$1 and not is_deleted', [legTwo])).n;
  await until('keypad ready', async () => await enter.isVisible() && !(await enter.isDisabled()));
  await type(60); await enter.click();
  await until('leg two visit', async () => await live() === 1);
  await until('keypad ready', async () => !(await enter.isDisabled()));
  await page.getByRole('button', { name: /Undo last score/ }).click();
  await until('undo', async () => await live() === 0);
  console.log('SMOKE_UNDO_PASS');

  // 6. The dashboard reflects the leg that was just played.
  await page.goto(url('/dashboard'));
  await page.getByText('Smoke Player').first().waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Dashboard overflows a phone screen');
  await page.screenshot({ path: 'smoke-verification/dashboard.png', fullPage: true });
  // Fetched from the page: the session cookie is Secure, which the browser honours on localhost.
  const exported = await page.evaluate(async path => { const r = await fetch(path); return { status: r.status, rows: await r.json() }; },
    '/api/exports/events?format=json&game=' + game);
  assert.equal(exported.status, 200);
  assert.equal(exported.rows.length, 5);
  console.log('SMOKE_DASHBOARD_PASS: dashboard renders the result and the export returns the five visits');

  // 7. Locking the device ends the session.
  await page.goto(url('/settings'));
  await page.getByRole('button', { name: 'Lock this device', exact: true }).click();
  await page.waitForURL('**/pin');
  await page.goto(url('/dashboard'));
  assert.ok(page.url().includes('/pin'), 'Session survived locking the device');
  console.log('SMOKE_LOCK_PASS');

  assert.deepEqual(errors, [], 'Script errors or Content-Security-Policy violations');
  console.log('SMOKE_PASS');
} catch (error) {
  if (page) await page.screenshot({ path: 'smoke-verification/failure.png', fullPage: true }).catch(() => {});
  throw error;
} finally {
  if (browser) await browser.close();
  await stack.stop(); await db.close();
}
