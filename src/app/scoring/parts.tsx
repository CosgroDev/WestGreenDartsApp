"use client";

import { canFinishFrom } from "@/lib/scoringUtils";

export type LegSummary = {
  winner: "west" | "opponent";
  dartsTotal: number;
  pointsTotal: number;
  threeDA: number | null;
  firstNine: number | null;
  firstNinePoints: number | null;
  firstNineDarts: number | null;
  buckets: Record<string, number>;
};

type KeypadProps = {
  keyClass: string;
  disabled: boolean;
  onDigit: (digit: number) => void;
  onDelete: () => void;
  onEnter: () => void;
};

/** The numeric keypad of the league scoring screen. */
export function ScoreKeypad({ keyClass, disabled, onDigit, onDelete, onEnter }: KeypadProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
        <button key={n} type="button" className={`keypad-key ${keyClass}`} disabled={disabled} onClick={() => onDigit(n)}>
          {n}
        </button>
      ))}
      <button
        type="button"
        className={`keypad-key ${keyClass} text-xl text-slate-500`}
        onClick={onDelete}
        disabled={disabled}
        aria-label="Delete digit"
      >
        ⌫
      </button>
      <button type="button" className={`keypad-key ${keyClass}`} disabled={disabled} onClick={() => onDigit(0)}>
        0
      </button>
      <button
        type="button"
        className={`keypad-key ${keyClass} bg-emerald-600 text-xl text-white`}
        style={{ borderColor: "rgba(18,184,134,0.6)" }}
        onClick={onEnter}
        disabled={disabled}
        aria-label="Enter score"
      >
        ✓
      </button>
    </div>
  );
}

type PromptProps = {
  score: number;
  keyClass: string;
  disabled: boolean;
  onDarts: (darts: number) => void;
  onCancel: () => void;
};

/** Asks how many darts a checkout took; dart counts that cannot finish the score are disabled. */
export function CheckoutDartsPrompt({ score, keyClass, disabled, onDarts, onCancel }: PromptProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
      <p className="text-lg font-bold text-emerald-800">GAME SHOT! 🎉</p>
      <p className="text-sm font-semibold text-slate-700">How many darts on the checkout?</p>
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3].map((d) => (
          <button
            key={d}
            type="button"
            className={`keypad-key ${keyClass} !text-lg`}
            disabled={disabled || !canFinishFrom(score, d)}
            onClick={() => onDarts(d)}
          >
            {d} dart{d > 1 ? "s" : ""}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="text-sm font-semibold text-red-600 underline"
        disabled={disabled}
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  );
}

/** Leg-by-leg and total figures shown once a match is complete. */
export function MatchSummaryPanel({ legs, westName, opponentName }: { legs: LegSummary[]; westName: string; opponentName: string }) {
  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
      <p className="font-semibold mb-2">Match summary (best of 2)</p>
      <div className="flex flex-col gap-2">
        {legs.map((leg, i) => (
          <div key={i} className="rounded-md border border-slate-200 p-2 bg-white">
            <p className="font-semibold">
              Leg {i + 1}: {leg.winner === "west" ? westName : opponentName}
            </p>
            <p>Total darts (West): {leg.dartsTotal}</p>
            <p>3-dart average (West): {leg.threeDA !== null ? leg.threeDA.toFixed(1) : "-"}</p>
            <p>First 9 darts avg (West): {leg.firstNine !== null ? leg.firstNine.toFixed(1) : "-"}</p>
            <p>Opponent 3DA: not tracked</p>
            <div className="mt-1 grid grid-cols-3 gap-1 text-xs text-slate-600">
              {Object.entries(leg.buckets).map(([label, val]) => (
                <span key={label}>
                  {label}: <strong>{val}</strong>
                </span>
              ))}
            </div>
          </div>
        ))}
        {legs.length > 1 && (() => {
          const totalDarts = legs.reduce((s, l) => s + l.dartsTotal, 0);
          const totalPoints = legs.reduce((s, l) => s + l.pointsTotal, 0);
          const totalBuckets = legs.reduce((acc, l) => {
            Object.entries(l.buckets).forEach(([k, v]) => (acc[k] = (acc[k] || 0) + v));
            return acc;
          }, {} as Record<string, number>);
          const total3da = totalDarts > 0 ? (totalPoints / totalDarts) * 3 : null;
          const totalFirst9Points = legs.reduce((s, l) => s + (l.firstNinePoints ?? 0), 0);
          const totalFirst9Darts = legs.reduce((s, l) => s + (l.firstNineDarts ?? 0), 0);
          const totalFirst9 = totalFirst9Darts > 0 ? (totalFirst9Points / totalFirst9Darts) * 3 : null;
          return (
            <div className="rounded-md border border-slate-200 p-2">
              <p className="font-semibold">Totals</p>
              <p>Total darts (West): {totalDarts}</p>
              <p>Average 3DA (West): {total3da ? total3da.toFixed(1) : "-"}</p>
              <p>Average first 9 (West): {totalFirst9 ? totalFirst9.toFixed(1) : "-"}</p>
              <p>Opponent 3DA: not tracked</p>
              <div className="mt-1 grid grid-cols-3 gap-1 text-xs text-slate-600">
                {Object.entries(totalBuckets).map(([label, val]) => (
                  <span key={label}>
                    {label}: <strong>{val}</strong>
                  </span>
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
