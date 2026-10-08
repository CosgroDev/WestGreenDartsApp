import assert from 'node:assert/strict';
import {pauseAndWait} from './ui-ux-browser-helpers.mjs';

// Called only by the isolated UI harness. Each setup is driven through the real
// browser form, then checked against SQL and rediscovered from Continue playing.
export async function verifySetupJourneys({ page, rt, db, goto, poll }) {
  assert.equal(rt.synthetic, true, 'Setup journeys require the synthetic local runtime.');
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(rt.appUrl).hostname));
  const results = [];
  const inactive = rt.players.find(p => !p.active);
  const teamPlayer = rt.players[2];

  async function step(name, run) {
    await run();
    results.push({ name, passed: true });
    console.log('SETUP_JOURNEY_PASS', name);
  }
  async function sessionFromRedirect(path) {
    await page.waitForURL(url => url.pathname === path && url.searchParams.has('session'));
    await page.getByRole('link', { name: 'Pause & save', exact: true }).waitFor();
    return new URL(page.url()).searchParams.get('session');
  }
  async function rediscover(mode, id, path) {
    await pauseAndWait(page);
    const continued = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Continue playing', exact: true }) });
    await continued.getByRole('combobox', { name: /^Mode\b/ }).selectOption(mode);
    const entry = continued.locator(`a[href="${path}?session=${id}"]`);
    assert.equal(await entry.count(), 1, 'The new game must be rediscoverable exactly once.');
    assert.match(await entry.innerText(), /Resume/);
    await entry.click();
    await page.getByRole('link', { name: 'Pause & save', exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, path);
    assert.equal(new URL(page.url()).searchParams.get('session'), id);
  }

  await step('X01 two-player setup excludes duplicates and preserves explicit guests', async () => {
    await goto('/practice');
    const form = page.locator('#x01 form');
    const a = form.getByRole('combobox', { name: /^Player A\b/ });
    const b = form.getByRole('combobox', { name: /^Player B\b/ });
    if (inactive) assert.equal(await a.locator(`option[value="${inactive.id}"]`).count(), 0);
    await a.selectOption(teamPlayer.id);
    assert.equal(await b.locator(`option[value="${teamPlayer.id}"]`).count(), 0);
    await b.selectOption('');
    await form.getByRole('combobox', { name: /^Start score\b/ }).selectOption('701');
    await form.getByRole('radio', { name: 'Play 5 legs', exact: true }).check({ force: true });
    await form.getByRole('button', { name: 'Start X01', exact: true }).click();
    const id = await sessionFromRedirect('/practice/scoring');
    const rows = await poll('select team_id,player_a_id,player_b_id,start_score,legs_to_play,solo_mode,status from practice_sessions where id=$1', [id], rows => rows.length === 1);
    assert.deepEqual(rows[0], { team_id: rt.team, player_a_id: teamPlayer.id, player_b_id: null, start_score: 701, legs_to_play: 5, solo_mode: false, status: 'in_progress' });
    const legs = (await db.query('select leg_index,status from practice_games where session_id=$1', [id])).rows;
    assert.deepEqual(legs, [{ leg_index: 1, status: 'in_progress' }]);
    assert.ok((await page.locator('body').innerText()).includes('Guest B'));
    await rediscover('x01', id, '/practice/scoring');
  });

  await step('X01 solo setup persists its format and resumes with one scoring side', async () => {
    await goto('/practice');
    const form = page.locator('#x01 form');
    await form.getByRole('combobox', { name: /^Players\b/ }).selectOption('solo');
    await form.getByRole('combobox', { name: /^Player\b/ }).selectOption(teamPlayer.id);
    assert.equal(await form.getByRole('combobox', { name: /^Player B\b/ }).count(), 0);
    await form.getByRole('combobox', { name: /^Start score\b/ }).selectOption('301');
    await form.getByRole('radio', { name: 'Play 1 leg', exact: true }).check({ force: true });
    await form.getByRole('button', { name: 'Start X01', exact: true }).click();
    const id = await sessionFromRedirect('/practice/scoring');
    const row = (await db.query('select player_a_id,player_b_id,start_score,legs_to_play,solo_mode from practice_sessions where id=$1', [id])).rows[0];
    assert.deepEqual(row, { player_a_id: teamPlayer.id, player_b_id: null, start_score: 301, legs_to_play: 1, solo_mode: true });
    await page.getByRole('button', { name: teamPlayer.name, exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Guest B', exact: true }).count(), 0);
    await rediscover('x01', id, '/practice/scoring');
    await page.getByRole('button', { name: teamPlayer.name, exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Guest B', exact: true }).count(), 0);
  });

  await step('121 setup saves the selected player and advance-base preference, then resumes', async () => {
    await goto('/practice/121');
    const form = page.locator('form');
    const picker = form.getByRole('combobox', { name: /^Player\b/ });
    if (inactive) assert.equal(await picker.locator(`option[value="${inactive.id}"]`).count(), 0);
    await picker.selectOption(teamPlayer.id);
    await form.getByRole('checkbox', { name: /Advance base on any finish/ }).check();
    await form.getByRole('button', { name: 'Start 121', exact: true }).click();
    const id = await sessionFromRedirect('/practice/121/scoring');
    const row = (await db.query('select team_id,player_id,advance_base_on_any_finish,current_checkout,remaining,current_turn,status from game_121_sessions where id=$1', [id])).rows[0];
    assert.deepEqual(row, { team_id: rt.team, player_id: teamPlayer.id, advance_base_on_any_finish: true, current_checkout: 121, remaining: 121, current_turn: 1, status: 'in_progress' });
    await rediscover('121', id, '/practice/121/scoring');
  });

  await step('Doubles setup preserves reordered long-name players without duplicate slots', async () => {
    await goto('/practice/doubles');
    const form = page.locator('form');
    const picker = form.getByRole('combobox', { name: /^Add players\b/ });
    if (inactive) assert.equal(await picker.locator(`option[value="${inactive.id}"]`).count(), 0);
    await picker.selectOption(rt.longNamePlayer);
    await form.getByRole('button', { name: 'Add', exact: true }).click();
    assert.equal(await picker.locator(`option[value="${rt.longNamePlayer}"]`).count(), 0);
    await picker.selectOption(teamPlayer.id);
    await form.getByRole('button', { name: 'Add', exact: true }).click();
    await form.getByRole('button', { name: `Move ${teamPlayer.name} up`, exact: true }).click();
    await form.getByRole('button', { name: 'Start Doubles Switch', exact: true }).click();
    const id = await sessionFromRedirect('/practice/doubles/scoring');
    const slots = (await db.query('select player_id,throw_order,round_index from doubles_practice_players where session_id=$1 order by throw_order', [id])).rows;
    assert.deepEqual(slots, [{ player_id: teamPlayer.id, throw_order: 0, round_index: 0 }, { player_id: rt.longNamePlayer, throw_order: 1, round_index: 0 }]);
    assert.equal((await db.query('select team_id from doubles_practice_sessions where id=$1', [id])).rows[0].team_id, rt.team);
    await rediscover('doubles', id, '/practice/doubles/scoring');
  });

  await step('Random Checkout setup saves the chosen player and resumes the same generated target', async () => {
    await goto('/practice/checkout');
    const form = page.locator('form');
    const picker = form.getByRole('combobox', { name: /^Player\b/ });
    if (inactive) assert.equal(await picker.locator(`option[value="${inactive.id}"]`).count(), 0);
    await picker.selectOption(teamPlayer.id);
    await form.getByRole('button', { name: 'Start Random Checkout', exact: true }).click();
    const id = await sessionFromRedirect('/practice/checkout/scoring');
    const row = (await db.query('select team_id,player_id,current_target,status from checkout_practice_sessions where id=$1', [id])).rows[0];
    assert.equal(row.team_id, rt.team);
    assert.equal(row.player_id, teamPlayer.id);
    assert.equal(row.status, 'in_progress');
    assert.ok(row.current_target >= 2 && row.current_target <= 170);
    await rediscover('checkout', id, '/practice/checkout/scoring');
    assert.equal((await db.query('select current_target from checkout_practice_sessions where id=$1', [id])).rows[0].current_target, row.current_target);
  });

  return results;
}
