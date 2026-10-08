"use client";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useScoreTask } from "@/lib/useScoreTask";
import { useScoringViewport } from "@/lib/useScoringViewport";
import { ScoreSaveStatus } from "@/components/ScoreSaveStatus";
import {
  get121CheckoutGuide,
  get121SingleMissGuide,
  resolve121Turn,
  type Game121Session,
  type Game121Turn,
  type CheckoutGuide,
} from "@/lib/game121";
import {
  load121StateAction,
  record121TurnAction,
  abandon121SessionAction,
  undo121Action,
} from "./actions";
import styles from "./game121.module.css";

export default function Game121Client({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<Game121Session | null>(null);
  const [turns, setTurns] = useState<Game121Turn[]>([]);
  const [inputScore, setInputScore] = useState("");
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<number | null>(null);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [panel, setPanel] = useState<"help" | "history" | null>(null);
  const panelTitle = useRef<HTMLHeadingElement>(null);
  const viewport = useScoringViewport(
    !session || session.status === "in_progress",
  );
  const confirmButton = useRef<HTMLButtonElement>(null);
  const scoreInput = useRef<HTMLInputElement>(null);
  const { pending, error, saved, run, retry, clearError } = useScoreTask();
  const applyState = (state: { session: any; turns: any[] }) => {
    setSession(state.session);
    setTurns(state.turns);
  };
  useEffect(() => {
    run(async () => {
      const state = await load121StateAction(sessionId);
      if (!state.ok) throw new Error(state.message);
      applyState(state);
    });
  }, [sessionId, run]);
  useEffect(() => {
    if (confirmation !== null)
      confirmButton.current?.focus({ preventScroll: true });
  }, [confirmation]);
  useEffect(() => {
    if (panel) panelTitle.current?.focus({ preventScroll: true });
  }, [panel]);
  const togglePanel = (next: "help" | "history") => {
    setPanel((current) => (current === next ? null : next));
  };
  const reload = () => {
    if (pending) return;
    run(async () => {
      const state = await load121StateAction(sessionId);
      if (!state.ok) throw new Error(state.message);
      applyState(state);
      clearError();
      setConfirmation(null);
      setLastResult(null);
    });
  };
  const locked =
    pending || error !== null || !session || session.status !== "in_progress";
  const guardExit = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      pending ||
      error ||
      (inputScore !== "" &&
        !confirm(
          "This score has not been entered. Leave without recording it?",
        ))
    )
      event.preventDefault();
  };
  const validScore = inputScore !== "" && Number(inputScore) <= 180;
  const setEntry = (value: string) => {
    if (!locked && /^\d{0,3}$/.test(value))
      setInputScore(value.replace(/^0+(?=\d)/, ""));
  };
  const save = (score: number, declaredBust = false) => {
    if (locked || !session) return;
    const requestId = crypto.randomUUID();
    run(async () => {
      const result = await record121TurnAction(
        sessionId,
        score,
        session.revision,
        requestId,
        declaredBust,
      );
      if (!result.ok)
        throw new Error(result.message || "Could not save the visit.");
      applyState(result);
      setInputScore("");
      setConfirmation(null);
      setLastResult(result.result);
    });
  };
  const submit = () => {
    if (locked || !session || !validScore || confirmation !== null) return;
    const score = Number(inputScore),
      outcome = resolve121Turn(session, score);
    if (outcome.finished) {
      setConfirmation(score);
      return;
    }
    save(score);
  };
  const abandon = () => {
    if (locked || !session) return;
    const requestId = crypto.randomUUID();
    run(async () => {
      const result = await abandon121SessionAction(
        sessionId,
        session.revision,
        requestId,
      );
      if (!result.ok)
        throw new Error(result.message || "Could not end the game.");
      const state = await load121StateAction(sessionId);
      if (!state.ok) throw new Error(state.message);
      applyState(state);
      setConfirmAbandon(false);
      setInputScore("");
    });
  };
  const undo = () => {
    if (pending || error || !session) return;
    const request = crypto.randomUUID();
    run(async () => {
      const result = await undo121Action(sessionId, session.revision, request);
      if (!result.ok) throw new Error(result.message || "Could not undo.");
      const state = await load121StateAction(sessionId);
      if (!state.ok) throw new Error(state.message);
      applyState(state);
      setConfirmation(null);
      setLastResult(null);
    });
  };
  const cancelCheckout = () => {
    if (locked) return;
    setConfirmation(null);
    requestAnimationFrame(() =>
      scoreInput.current?.focus({ preventScroll: true }),
    );
  };
  const status = (
    <ScoreSaveStatus
      pending={pending && session !== null}
      saved={saved && turns.length > 0}
      error={error}
      retry={retry}
      reload={reload}
    />
  );
  if (!session)
    return (
      <main ref={viewport} className={styles.viewport}>
        <div className={styles.loading}>
          <section className={styles.panel}>
            <h1>121 Challenge</h1>
            <p role="status">Loading your game…</p>
            {status}
          </section>
        </div>
      </main>
    );
  const name = session.player?.name || "Guest";
  const history = (
    <details className={styles.panel} open={panel === "history"}>
      <summary>Visit history · {turns.length}</summary>
      <div className={styles.history}>
        {turns.length ? (
          turns.slice(0, 20).map((t) => <TurnRow key={t.id} turn={t} />)
        ) : (
          <p>No visits recorded yet.</p>
        )}
      </div>
      {turns.length > 20 && (
        <p className={styles.muted}>Showing the most recent 20 visits.</p>
      )}
    </details>
  );
  if (session.status !== "in_progress")
    return (
      <main className={styles.shell}>
        <section className={styles.panel}>
          <p className={styles.eyebrow}>121 Challenge · {name}</p>
          <h1>
            {session.status === "won" ? "You finished 170!" : "Game ended"}
          </h1>
          <p>
            {turns.length} recorded visit{turns.length === 1 ? "" : "s"} ·
            Locked base {session.base_checkout}
          </p>
          {status}
          <button
            className={styles.secondary}
            onClick={undo}
            disabled={pending || !!error}
          >
            Undo final action
          </button>
          <a
            href="/practice/121"
            onClick={guardExit}
            aria-disabled={pending || !!error}
            className={styles.primary}
          >
            Play again
          </a>
          <a
            href="/practice"
            onClick={guardExit}
            aria-disabled={pending || !!error}
            className={styles.secondary}
          >
            Back to practice
          </a>
        </section>
        {history}
      </main>
    );
  const guide = get121CheckoutGuide(session.remaining);
  const miss = get121SingleMissGuide(session.remaining, guide);
  const preview = validScore
    ? resolve121Turn(session, Number(inputScore))
    : null;
  const previewText = !validScore
    ? inputScore
      ? "Enter a score from 0 to 180."
      : "Enter the total for this visit."
    : preview!.finished
      ? "Finish on a double or Bull to confirm."
      : preview!.result === "failed"
        ? `Returns to base ${session.base_checkout}.`
        : preview!.isBust
          ? `Bust · ${session.remaining} stays for visit ${session.current_turn + 1}.`
          : `Leaves ${preview!.remainingAfter} for visit ${session.current_turn + 1}.`;
  const resultText =
    lastResult === "locked"
      ? `Checkout complete · base locked at ${session.base_checkout}.`
      : lastResult === "progressed"
        ? `Checkout complete · now attempt ${session.current_checkout}.`
        : lastResult === "failed"
          ? `Three visits used · back to base ${session.base_checkout}.`
          : null;
  const help = (
    <div className={styles.help}>
      <p>
        T = treble, S = single, D = double. Bull is the inner bull worth 50; 25
        is the outer bull.
      </p>
      {miss && (
        <div className={styles.missHelp}>
          <h2>If your first dart hits {miss.hit.label}</h2>
          <p>{miss.remaining} left with two darts in this visit.</p>
          <Route guide={miss.guide} />
          <p>
            {miss.guide.kind === "finish"
              ? "This can still finish in this visit."
              : session.current_turn === 3
                ? `No finish in two darts. This last visit will return the attempt to base ${session.base_checkout} if unfinished.`
                : `Use the setup to leave ${miss.guide.leave} for another visit.`}
          </p>
        </div>
      )}
      <p>
        Each checkout gets three visits of up to three darts. Enter the visit
        total after throwing. Checkout guidance suggests a route; enter what you
        actually scored.
      </p>
      <p>
        {session.advance_base_on_any_finish
          ? "Any finish within the three visits locks the completed checkout as your base."
          : "Finishing in visit 1 locks the completed checkout as your base. A visit 2 or 3 finish advances the target while the base stays unchanged."}
      </p>
      <p>
        If three visits pass without a finish, return to your locked base. Bogey
        targets such as 159 need a setup before you can finish.
      </p>
      <p>
        Miss records zero. Bust uses the visit and keeps its starting remaining
        score. If it was visit 3, the attempt returns to base. The Back link
        keeps your game saved so you can resume from the 121 page.
      </p>
    </div>
  );
  return (
    <main ref={viewport} className={styles.viewport}>
      <div className={`${styles.shell} ${styles.live}`}>
        <header className={styles.header}>
          <div>
            <a
              href="/practice/121"
              onClick={guardExit}
              aria-disabled={pending || !!error}
              className={styles.back}
            >
              ‹ 121 Challenge
            </a>
            <p
              className={styles.muted}
              role={resultText ? "status" : undefined}
              title={resultText || name}
            >
              {resultText || name}
            </p>
          </div>
          <button
            type="button"
            className={styles.secondary}
            disabled={locked || confirmation !== null}
            onClick={() => setConfirmAbandon(true)}
          >
            End &amp; results
          </button>
        </header>
        {confirmAbandon ? (
          <section
            className={`${styles.panel} ${styles.pausePanel}`}
            aria-label="End game confirmation"
          >
            <p>End this game and keep its practice record?</p>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.secondary}
                disabled={locked}
                onClick={() => setConfirmAbandon(false)}
              >
                Keep playing
              </button>
              <button
                type="button"
                className={styles.primary}
                disabled={locked}
                onClick={abandon}
              >
                End &amp; results
              </button>
            </div>
            {status}
          </section>
        ) : panel ? (
          <section
            className={styles.pausePanel}
            aria-label={panel === "help" ? "Checkout help" : "Visit history"}
          >
            <div className={styles.panelHeading}>
              <h2 ref={panelTitle} tabIndex={-1}>
                {panel === "help"
                  ? "Checkout help & game rules"
                  : "Visit history"}
              </h2>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => {
                  setPanel(null);
                  requestAnimationFrame(() =>
                    scoreInput.current?.focus({ preventScroll: true }),
                  );
                }}
              >
                Back to scoring
              </button>
            </div>
            <div className={styles.panelScroll}>
              {panel === "history" ? history : help}
            </div>
          </section>
        ) : (
          <div className={styles.game}>
            <section
              className={styles.scoreboard}
              aria-label="Current checkout"
            >
              <div className={styles.meta}>
                <span>
                  Target <strong>{session.current_checkout}</strong> / 170
                </span>
                <span>
                  Locked base <strong>{session.base_checkout}</strong>
                </span>
              </div>
              <div
                className={styles.progress}
                role="progressbar"
                aria-label="Checkout progression"
                aria-valuemin={121}
                aria-valuemax={170}
                aria-valuenow={session.current_checkout}
              >
                <div
                  style={{
                    width: ((session.current_checkout - 121) / 49) * 100 + "%",
                  }}
                />
              </div>
              <div className={styles.scoreLine}>
                <div>
                  <p className={styles.eyebrow}>Remaining</p>
                  <output
                    className={styles.remaining}
                    aria-label="Remaining score"
                  >
                    {session.remaining}
                  </output>
                </div>
                <div className={styles.visit}>
                  <p className={styles.eyebrow}>Visit</p>
                  <p className={styles.visitNumber}>
                    {session.current_turn}
                    <span> / 3</span>
                  </p>
                  <p className={styles.muted}>
                    {(4 - session.current_turn) * 3} darts left in attempt
                  </p>
                  <div
                    className={styles.dots}
                    aria-label={`Visit ${session.current_turn} of 3`}
                  >
                    {[1, 2, 3].map((v) => (
                      <span
                        key={v}
                        className={
                          v === session.current_turn
                            ? styles.currentDot
                            : v < session.current_turn
                              ? styles.usedDot
                              : styles.dot
                        }
                      />
                    ))}
                  </div>
                </div>
              </div>
              <section className={styles.guide} aria-label="Checkout guidance">
                <p className={styles.guideTitle}>
                  {guide.kind === "finish"
                    ? "Suggested checkout"
                    : session.current_turn === 3
                      ? "No three-dart checkout · last visit"
                      : "No three-dart checkout · set up the next visit"}
                </p>
                <Route guide={guide} />
                <p className={styles.guideNote}>
                  {guide.kind === "finish"
                    ? "Finish on a double or Bull."
                    : session.current_turn === 3
                      ? "Last visit: a setup will return this attempt to your base."
                      : `Leaves ${guide.leave} for your next visit.`}
                </p>
              </section>
            </section>
            <form
              className={`${styles.entry} ${confirmation !== null && !error ? styles.entryConfirm : ""} ${error ? styles.entryRecovery : ""}`}
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              aria-label="Score entry"
            >
              {(confirmation === null || error) && (
                <div className={styles.entryHeading}>
                  <div>
                    <label htmlFor="visit-score">
                      Visit {session.current_turn} score
                    </label>
                    <p className={styles.preview} id="score-preview">
                      {previewText}
                    </p>
                  </div>
                  <input
                    ref={scoreInput}
                    id="visit-score"
                    aria-label="Visit score"
                    aria-describedby="score-preview"
                    aria-invalid={inputScore !== "" && !validScore}
                    inputMode="none"
                    autoComplete="off"
                    type="text"
                    maxLength={3}
                    value={inputScore}
                    disabled={locked}
                    placeholder="–"
                    onChange={(e) => setEntry(e.target.value)}
                  />
                </div>
              )}
              {error ? (
                <div className={styles.recovery}>{status}</div>
              ) : confirmation !== null ? (
                <div
                  className={styles.confirmation}
                  role="dialog"
                  aria-labelledby="checkout-confirmation-title"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") cancelCheckout();
                  }}
                >
                  <h2 id="checkout-confirmation-title">
                    Did you finish on a double?
                  </h2>
                  <p>{confirmation} scored · a Bull finish also counts.</p>
                  <button
                    ref={confirmButton}
                    type="button"
                    className={styles.primary}
                    disabled={locked}
                    onClick={() => save(confirmation)}
                  >
                    Confirm double-out
                  </button>
                  <button
                    type="button"
                    className={styles.secondary}
                    disabled={locked}
                    onClick={() => save(confirmation, true)}
                  >
                    No double · record a bust
                  </button>
                  <button
                    type="button"
                    className={styles.secondary}
                    disabled={locked}
                    onClick={cancelCheckout}
                  >
                    Edit score
                  </button>
                </div>
              ) : (
                <>
                  <div className={styles.keypad}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={styles.key}
                        disabled={locked}
                        onClick={() => setEntry(inputScore + n)}
                      >
                        {n}
                      </button>
                    ))}
                    <button
                      type="button"
                      className={styles.key}
                      disabled={locked || !inputScore}
                      aria-label="Delete last digit"
                      onClick={() => setEntry(inputScore.slice(0, -1))}
                    >
                      ⌫
                    </button>
                    <button
                      type="button"
                      className={styles.key}
                      disabled={locked}
                      onClick={() => setEntry(inputScore + "0")}
                    >
                      0
                    </button>
                    <button
                      type="button"
                      className={styles.key}
                      disabled={locked || !inputScore}
                      onClick={() => setEntry("")}
                    >
                      Clear
                    </button>
                  </div>
                  <div className={styles.scoreActions}>
                    <button
                      type="button"
                      className={styles.secondary}
                      disabled={locked}
                      onClick={() => save(0)}
                    >
                      Miss · 0
                    </button>
                    <button
                      type="button"
                      className={styles.secondary}
                      disabled={locked}
                      onClick={() =>
                        save(validScore ? Number(inputScore) : 0, true)
                      }
                    >
                      Bust
                    </button>
                    <button
                      type="submit"
                      className={styles.primary}
                      disabled={locked || !validScore}
                    >
                      Enter score
                    </button>
                  </div>
                </>
              )}
              {!error && <div className={styles.saveStatus}>{status}</div>}
            </form>
          </div>
        )}
        <footer className={styles.toolbar} aria-label="Game information">
          <button
            type="button"
            className={styles.secondary}
            disabled={locked || !turns.length}
            onClick={undo}
          >
            Undo last visit
          </button>
          <a
            href="/practice"
            className={styles.secondary}
            aria-disabled={pending || !!error}
            onClick={guardExit}
          >
            Pause &amp; save
          </a>
          <button
            type="button"
            className={styles.secondary}
            aria-expanded={panel === "help"}
            onClick={() => togglePanel("help")}
            disabled={confirmAbandon || confirmation !== null}
          >
            Checkout help &amp; game rules
          </button>
          <button
            type="button"
            className={styles.secondary}
            aria-expanded={panel === "history"}
            onClick={() => togglePanel("history")}
            disabled={confirmAbandon || confirmation !== null}
          >
            Visit history · {turns.length}
          </button>
        </footer>
      </div>
    </main>
  );
}
function Route({ guide }: { guide: CheckoutGuide }) {
  let remaining =
    guide.targets.reduce((sum, t) => sum + t.score, 0) + guide.leave;
  return (
    <ol
      className={styles.route}
      aria-label={
        guide.kind === "finish"
          ? "Suggested dart targets"
          : "Suggested setup targets"
      }
    >
      {guide.targets.map((target, index) => {
        remaining -= target.score;
        return (
          <li
            key={index}
            aria-label={`Dart ${index + 1}: ${target.description}`}
          >
            <strong>{target.label}</strong>
            <span>{remaining === 0 ? "Double out" : remaining + " left"}</span>
          </li>
        );
      })}
    </ol>
  );
}
function TurnRow({ turn }: { turn: Game121Turn }) {
  const label =
    turn.result === "locked"
      ? "Base locked"
      : turn.result === "progressed"
        ? "Checkout complete"
        : turn.result === "failed"
          ? "Back to base"
          : turn.result === "won"
            ? "Challenge won"
            : turn.remaining_after + " left";
  return (
    <div className={styles.turnRow}>
      <div>
        <strong>
          {turn.checkout} target · Visit {turn.turn_number}
        </strong>
        <span>
          {turn.is_bust ? "Bust · " : ""}
          {turn.score} scored
        </span>
      </div>
      <span>{label}</span>
    </div>
  );
}
