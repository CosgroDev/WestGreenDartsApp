import {
  PERFORMANCE_METRICS, PERFORMANCE_MIN_LEGS, PERFORMANCE_MIN_VISITS,
  type PerformanceLeaderboard,
} from "@/lib/playerPerformance";

export function LeaderboardExplanation({ model }: { model: PerformanceLeaderboard }) {
  return <details className="rounded-xl border border-slate-300 p-3 text-sm">
    <summary className="cursor-pointer font-semibold">How the performance score is calculated</summary>
    <div className="mt-3 space-y-3 text-slate-700">
      <p>This is a relative season performance index out of 100, based on active West Green players and completed league legs. It is not a predicted win percentage. Practice results are excluded.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <caption className="sr-only">Performance weights and sample adjustments</caption>
          <thead><tr><th className="py-2 pr-2">Measure</th><th className="pr-2">Weight</th><th>Team-average prior</th></tr></thead>
          <tbody>{PERFORMANCE_METRICS.map(m=><tr key={m.id} className="border-t border-slate-200">
            <td className="py-2 pr-2">{m.label}</td><td className="pr-2">{m.weight}%</td><td>{m.prior} {m.unit}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <ol className="list-decimal space-y-2 pl-5">
        <li>Calculate each player's raw rates and averages. Win rate is legs won ÷ completed legs. Ton rate is 100+ visits ÷ all recorded visits, including busts as zero scores.</li>
        <li>Allow for sample size. Adjusted value = (sample × player value + prior × team value) ÷ (sample + prior). Team values are averages weighted by the relevant number of legs, darts or visits across active players in this season.</li>
        <li>Compare each adjusted measure with the qualifying players. Percentile = 100 × (players below + half the players tied) ÷ comparison group size. Equal measures share credit; a one-player group gives 50.</li>
        <li>Add the weighted percentiles. Overall score = 0.35 × wins percentile + 0.25 × average percentile + 0.15 × First 9 percentile + 0.15 × checkout percentile + 0.10 × ton-rate percentile.</li>
      </ol>
      <p>For example, 4 wins from 4 legs is 100%. If the team win rate is 50%, the 12-leg prior adjusts it to (4 × 100 + 12 × 50) ÷ 16 = 62.5%. The raw record still appears on the player card.</p>
      <p>Qualification needs {PERFORMANCE_MIN_LEGS} completed legs, {PERFORMANCE_MIN_VISITS} recorded visits and evidence for all five measures. Other players appear afterwards as provisional. Missing measures receive a neutral percentile of 50; they are not recorded as zero. Qualified ties share a position. Calculations use full precision; displayed values are rounded.</p>
      <p>{model.usingProvisionalReference
        ? `No players qualify yet. Scores currently compare ${model.referenceCount} provisional players; no official positions are awarded.`
        : `Scores currently compare ${model.referenceCount} qualifying player${model.referenceCount===1?"":"s"}. Provisional scores use that same comparison group.`}</p>
      <p>Tap “Score breakdown” on any player to see the raw value, sample size, team baseline, adjusted value, percentile and points contributed. More appearances increase the influence of their own record rather than awarding attendance points.</p>
      <p>The weights and minimum samples are explicit team policy, not statistically fitted “best” values. Scoring measures overlap, so their combined weight is limited. 140s and 180s already contribute to ton rate and averages; high finishes are single achievements, and darts per win only measures won legs. Those figures, 60+ visits, 26s and recent form remain visible for context without additional points.</p>
      <p>Checkout efficiency measures successful visits starting on a possible finish, including busts. Darts actually aimed at doubles are not recorded. This model does not adjust for opponent strength or estimate statistical confidence intervals. It describes recorded season performance; scores can change when the comparison group changes.</p>
    </div>
  </details>;
}
