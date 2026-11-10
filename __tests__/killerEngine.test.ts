import {
  INITIAL_LIVES, addPlayer, adjustLives, continueAfterShuffle, createGame, finalProofHit, finalProofMiss,
  getAlivePlayers, getNextPlayerIndex, hitTarget, missDart, removePlayer, resetGame, setFirstSegment,
  setNewSegment, skipCurrentPlayer, startGame, undoDart, type KillerGame
} from "@/lib/killerEngine";

// nanoid ships as ES modules only, which this Jest setup does not transform.
jest.mock("nanoid", () => { let n = 0; return { nanoid: () => `id-${++n}` }; });

const lobby = (...names: string[]) => names.reduce((game, name) => addPlayer(game, name), createGame());
/** A started game with the first segment set; player 0 owns it and player 1 is throwing. */
const started = (...names: string[]) => setFirstSegment(continueAfterShuffle(startGame(lobby(...names))), "T20");
const miss = (game: KillerGame, darts: number) => Array.from({ length: darts }).reduce<KillerGame>((g) => missDart(g), game);

describe("lobby", () => {
  it("adds players with full lives and grows the pot by one each", () => {
    const game = lobby("Ann", "Bob");
    expect(game.players.map((p) => [p.name, p.lives, p.status, p.turn_order])).toEqual([
      ["Ann", INITIAL_LIVES, "alive", 0], ["Bob", INITIAL_LIVES, "alive", 1]
    ]);
    expect(game.pot).toBe(2);
  });

  it("ignores blank and duplicate names, whatever the case", () => {
    const game = lobby("Ann", "  ", "ann", " Ann ");
    expect(game.players).toHaveLength(1);
  });

  it("removes a player and renumbers the rest", () => {
    const game = lobby("Ann", "Bob", "Cat");
    const without = removePlayer(game, game.players[0].id);
    expect(without.players.map((p) => [p.name, p.turn_order])).toEqual([["Bob", 0], ["Cat", 1]]);
    expect(without.pot).toBe(2);
  });

  it("needs two players to start", () => {
    expect(startGame(lobby("Ann")).state).toBe("waiting_for_players");
    expect(startGame(lobby("Ann", "Bob")).state).toBe("shuffle_animation");
  });

  it("locks the roster once the game has started", () => {
    const game = startGame(lobby("Ann", "Bob"));
    expect(addPlayer(game, "Cat").players).toHaveLength(2);
    expect(removePlayer(game, game.players[0].id).players).toHaveLength(2);
  });

  it("keeps every player through the shuffle with consecutive turn orders", () => {
    const game = startGame(lobby("Ann", "Bob", "Cat", "Dan"));
    expect(game.players.map((p) => p.name).sort()).toEqual(["Ann", "Bob", "Cat", "Dan"]);
    expect(game.players.map((p) => p.turn_order)).toEqual([0, 1, 2, 3]);
  });

  it("carries a rollover pot into a new game", () => {
    expect(resetGame(5)).toMatchObject({ rollover_pot: 5, pot: 0, state: "waiting_for_players", players: [] });
  });
});

describe("attack phase", () => {
  it("makes the first player the owner and the next player the attacker", () => {
    const game = started("Ann", "Bob", "Cat");
    expect(game).toMatchObject({ state: "attack_phase", current_segment: "T20", current_player_index: 1, darts_thrown_this_turn: 0 });
    expect(game.segment_owner_id).toBe(game.players[0].id);
  });

  it("counts misses and takes a life on the third", () => {
    let game = started("Ann", "Bob", "Cat");
    game = miss(game, 2);
    expect(game.darts_thrown_this_turn).toBe(2);
    expect(game.players[1].lives).toBe(INITIAL_LIVES);
    game = missDart(game);
    expect(game.players[1].lives).toBe(INITIAL_LIVES - 1);
    expect(game).toMatchObject({ current_player_index: 2, darts_thrown_this_turn: 0 });
  });

  it("skips the segment owner when the turn comes round", () => {
    let game = started("Ann", "Bob", "Cat");
    game = miss(game, 3); // Bob
    game = miss(game, 3); // Cat
    expect(game.current_player_index).toBe(1);
  });

  it("undoes a dart within the turn but never below zero", () => {
    let game = missDart(started("Ann", "Bob"));
    game = undoDart(game);
    expect(game.darts_thrown_this_turn).toBe(0);
    expect(undoDart(game)).toBe(game);
  });

  it("hands the segment to whoever hits it, who then sets a new one", () => {
    let game = hitTarget(started("Ann", "Bob", "Cat"));
    expect(game.state).toBe("segment_setting_phase");
    expect(game.segment_owner_id).toBe(game.players[1].id);
    game = setNewSegment(game, "D16");
    expect(game).toMatchObject({ state: "attack_phase", current_segment: "D16", current_player_index: 2 });
    expect(game.segment_owner_id).toBe(game.players[1].id);
  });

  it("eliminates a player on their last life and skips them afterwards", () => {
    let game = started("Ann", "Bob", "Cat");
    game = adjustLives(game, game.players[1].id, -2);
    game = miss(game, 3); // Bob loses his last life
    expect(game.players[1]).toMatchObject({ lives: 0, status: "eliminated" });
    expect(getAlivePlayers(game).map((p) => p.name)).not.toContain(game.players[1].name);
    game = miss(game, 3); // Cat; the turn must not return to Bob
    expect(game.current_player_index).toBe(2);
  });

  it("skips the current player without costing a life", () => {
    const game = skipCurrentPlayer(started("Ann", "Bob", "Cat"));
    expect(game.current_player_index).toBe(2);
    expect(game.players[1].lives).toBe(INITIAL_LIVES);
  });

  it("ignores actions that do not belong to the current phase", () => {
    const waiting = lobby("Ann", "Bob");
    for (const action of [hitTarget, missDart, undoDart, skipCurrentPlayer, finalProofHit, finalProofMiss, continueAfterShuffle]) {
      expect(action(waiting)).toBe(waiting);
    }
    expect(setFirstSegment(waiting, "T20")).toBe(waiting);
    expect(setNewSegment(waiting, "T20")).toBe(waiting);
  });
});

describe("ending", () => {
  const lastOneStanding = () => {
    let game = started("Ann", "Bob");
    game = adjustLives(game, game.players[1].id, -2);
    return miss(game, 3);
  };

  it("sends the last player standing to a final proof", () => {
    const game = lastOneStanding();
    expect(game).toMatchObject({ state: "final_proof", current_player_index: 0, darts_thrown_this_turn: 0 });
  });

  it("wins on a final-proof hit", () => {
    const game = finalProofHit(lastOneStanding());
    expect(game.state).toBe("game_over");
    expect(game.winner_id).toBe(game.players[0].id);
  });

  it("allows three darts per remaining life before the pot rolls over", () => {
    let game = lastOneStanding();
    game = Array.from({ length: INITIAL_LIVES * 3 - 1 }).reduce<KillerGame>((g) => finalProofMiss(g), game);
    expect(game.state).toBe("final_proof");
    game = finalProofMiss(game);
    expect(game).toMatchObject({ state: "rollover", winner_id: null });
  });

  it("gives a wounded finalist fewer darts", () => {
    let game = lastOneStanding();
    game = adjustLives(game, game.players[0].id, -2);
    game = finalProofMiss(finalProofMiss(game));
    expect(game.state).toBe("final_proof");
    expect(finalProofMiss(game).state).toBe("rollover");
  });
});

describe("helpers", () => {
  it("clamps manual life changes and revives or eliminates accordingly", () => {
    let game = lobby("Ann", "Bob");
    const id = game.players[0].id;
    game = adjustLives(game, id, +5);
    expect(game.players[0].lives).toBe(INITIAL_LIVES);
    game = adjustLives(game, id, -10);
    expect(game.players[0]).toMatchObject({ lives: 0, status: "eliminated" });
    game = adjustLives(game, id, +1);
    expect(game.players[0]).toMatchObject({ lives: 1, status: "alive" });
  });

  it("returns the starting index when nobody else can throw", () => {
    let game = started("Ann", "Bob");
    game = adjustLives(game, game.players[1].id, -3);
    expect(getNextPlayerIndex(game, 0, game.players[0].id)).toBe(0);
  });
});
