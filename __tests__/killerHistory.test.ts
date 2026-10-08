jest.mock("nanoid", () => ({ nanoid: jest.fn(() => `id-${Math.random()}`) }));
import {
  createGame,
  addPlayer,
  startGame,
  continueAfterShuffle,
  setFirstSegment,
  missDart,
  hitTarget,
  setNewSegment,
  finalProofHit,
  finalProofMiss,
  applyKillerAction,
  undoKillerAction,
  isKillerGame,
  type KillerHistory,
  type KillerGame,
} from "../src/lib/killerEngine";
function game(): KillerGame {
  const lobby = addPlayer(addPlayer(createGame(4), "Alice"), "Bob");
  const started = continueAfterShuffle(startGame(lobby));
  return setFirstSegment(started, "D20");
}
describe("Killer complete action recovery", () => {
  it("undoes the third miss, life loss, elimination and final-proof transition together", () => {
    let before = game();
    const active = before.players[before.current_player_index];
    before = {
      ...before,
      darts_thrown_this_turn: 2,
      players: before.players.map((p) =>
        p.id === active.id ? { ...p, lives: 1 } : p,
      ),
    };
    const history = applyKillerAction(
      { game: before, previous: [] },
      missDart(before),
    );
    expect(history.game.state).toBe("final_proof");
    expect(history.game.players.find((p) => p.id === active.id)?.status).toBe(
      "eliminated",
    );
    expect(undoKillerAction(history).game).toEqual(before);
  });
  it("restores ownership and target after undoing segment selection and its preceding hit", () => {
    const before = game();
    let history: KillerHistory = { game: before, previous: [] };
    history = applyKillerAction(history, hitTarget(history.game));
    const hit = history.game;
    history = applyKillerAction(history, setNewSegment(history.game, "T19"));
    history = undoKillerAction(history);
    expect(history.game).toEqual(hit);
    history = undoKillerAction(history);
    expect(history.game).toEqual(before);
  });
  it("undoes proof wins and rollover without losing the pot or previous lives", () => {
    const proof = {
      ...game(),
      state: "final_proof" as const,
      darts_thrown_this_turn: 8,
    };
    const win = applyKillerAction(
      { game: proof, previous: [] },
      finalProofHit(proof),
    );
    expect(win.game.state).toBe("game_over");
    expect(undoKillerAction(win).game).toEqual(proof);
    const rollover = applyKillerAction(
      { game: proof, previous: [] },
      finalProofMiss(proof),
    );
    expect(rollover.game.state).toBe("rollover");
    expect(undoKillerAction(rollover).game).toEqual(proof);
  });
  it("keeps snapshots independent and caps saved history", () => {
    const before = game();
    let history: KillerHistory = { game: before, previous: [] };
    for (let i = 0; i < 120; i++)
      history = applyKillerAction(history, { ...history.game, pot: i });
    expect(history.previous.length).toBe(100);
    const snapshot = structuredClone(history.previous.at(-1));
    history.game.players[0].lives = 0;
    expect(history.previous.at(-1)).toEqual(snapshot);
  });
  it("rejects corrupt persisted game state and accepts both lobby and active games", () => {
    expect(isKillerGame(createGame())).toBe(true);
    expect(isKillerGame(game())).toBe(true);
    expect(isKillerGame({ state: "attack_phase" })).toBe(false);
    expect(isKillerGame({ ...game(), current_player_index: 99 })).toBe(false);
  });
});
