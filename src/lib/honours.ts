import type { PlayerCard } from "@/data/stats";

export const MIN_HONOURS_LEGS = 6;
export type Honour = {
  id: string;
  title: string;
  criteria: string;
  value: string;
  leaders: { player: PlayerCard; evidence: string }[];
};

type Rule = {
  id: string;
  title: string;
  criteria: string;
  metric: (p: PlayerCard) => number | null;
  format: (value: number) => string;
  evidence: (p: PlayerCard) => string;
  lower?: boolean;
  record?: boolean;
};

export function getHonours(players: PlayerCard[]): Honour[] {
  const rules: Rule[] = [
    {
      id: "win-rate", title: "🏆 Winning impact", criteria: "Highest leg win percentage · 6+ completed legs",
      metric: p => p.legs_played > 0 ? p.legs_won / p.legs_played * 100 : null,
      format: v => v.toFixed(1) + "%",
      evidence: p => `${p.legs_won} wins from ${p.legs_played} legs`
    },
    {
      id: "scoring", title: "🎯 Best scorer", criteria: "Highest three-dart average · 6+ completed legs",
      metric: p => p.total_darts > 0 ? p.three_dart_avg : null,
      format: v => v.toFixed(1),
      evidence: p => `3-dart average across ${p.total_darts} recorded darts`
    },
    {
      id: "first-nine", title: "🚀 Strongest starter", criteria: "Highest first-nine average · 6+ recorded opening nines",
      metric: p => p.first_nine_legs >= 6 ? p.first_nine_avg : null,
      format: v => v.toFixed(1),
      evidence: p => `First-nine average across ${p.first_nine_legs} legs`
    },
    {
      id: "checkout", title: "🧊 Checkout efficiency", criteria: "Highest finishing-visit success rate · 6+ legs and 10+ finishing visits",
      metric: p => p.checkout_attempts >= 10 ? p.checkout_hits / p.checkout_attempts * 100 : null,
      format: v => v.toFixed(1) + "%",
      evidence: p => `${p.checkout_hits} checkouts from ${p.checkout_attempts} visits with a possible finish`
    },
    {
      id: "speed", title: "⚡ Fastest finisher", criteria: "Fewest average darts per leg won · 6+ legs and 3+ wins with dart counts",
      metric: p => p.recorded_wins >= 3 && (p.darts_per_leg_won ?? 0) > 0 ? p.darts_per_leg_won : null,
      format: v => v.toFixed(1) + " darts", lower: true,
      evidence: p => `Average across ${p.recorded_wins} wins with recorded dart counts`
    },
    {
      id: "tons", title: "💯 Ton frequency", criteria: "Most 100+ visits per 100 visits · 6+ legs and 30+ recorded visits",
      metric: p => p.scoring_visits >= 30 && p.hundred_plus > 0 ? p.hundred_plus / p.scoring_visits * 100 : null,
      format: v => v.toFixed(1) + "%",
      evidence: p => `${p.hundred_plus} visits of 100+ from ${p.scoring_visits} visits (includes 140+ and 180)`
    },
    {
      id: "high-finish", title: "✨ Highest checkout", criteria: "Best single checkout · no minimum appearances",
      metric: p => (p.high_finish ?? 0) > 0 ? p.high_finish : null,
      format: v => String(v), record: true,
      evidence: () => "Single-leg achievement"
    }
  ];

  return rules.map(rule => {
    const candidates = players
      .filter(p => rule.record || p.legs_played >= MIN_HONOURS_LEGS)
      .map(player => ({ player, metric: rule.metric(player) }))
      .filter((entry): entry is { player: PlayerCard; metric: number } =>
        entry.metric !== null && Number.isFinite(entry.metric));
    const best = candidates.length
      ? (rule.lower ? Math.min : Math.max)(...candidates.map(c => c.metric))
      : null;
    return {
      id: rule.id, title: rule.title, criteria: rule.criteria,
      value: best === null ? "—" : rule.format(best),
      leaders: candidates
        .filter(c => best !== null && Math.abs(c.metric - best) < 1e-9)
        .sort((a, b) => a.player.name.localeCompare(b.player.name))
        .map(c => ({ player: c.player, evidence: rule.evidence(c.player) }))
    };
  });
}
