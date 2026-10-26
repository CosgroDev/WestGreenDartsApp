import type { PlayerCard } from "@/data/stats";
import { adjustPerformanceMetric, performancePercentile } from "@/lib/playerPerformance";

// Aura is a flair index, deliberately separate from the performance score.
// Performance asks "how good is this player?"; aura asks "how exciting are they
// to watch?" — maximums, heavy scoring, big finishes, quick legs and fast starts.
// Weights and priors are explicit team policy, not fitted coefficients.
export const AURA_METRICS = [
  { id: "maximums", label: "180 rate", trait: "Maximum merchant", weight: 30, prior: 60, unit: "visits" },
  { id: "heavy", label: "140+ rate", trait: "Heavy hitter", weight: 25, prior: 60, unit: "visits" },
  { id: "bigFish", label: "Biggest checkout", trait: "Big-fish hunter", weight: 20, prior: 0, unit: "legs" },
  { id: "speed", label: "Darts per leg won", trait: "Speed demon", weight: 15, prior: 3, unit: "wins" },
  { id: "opening", label: "First 9 average", trait: "Fast starter", weight: 10, prior: 6, unit: "opening nines" },
] as const;
export const AURA_MIN_LEGS = 6;
type MetricId = typeof AURA_METRICS[number]["id"];

export type AuraTier = { id: string; name: string; emoji: string; min: number; blurb: string };
// Highest threshold first.
export const AURA_TIERS: AuraTier[] = [
  { id: "inferno", name: "Inferno", emoji: "🔥", min: 80, blurb: "Can't look away" },
  { id: "electric", name: "Electric", emoji: "⚡", min: 60, blurb: "Crackling with big moments" },
  { id: "sparkling", name: "Sparkling", emoji: "✨", min: 40, blurb: "Flashes of brilliance" },
  { id: "glimmer", name: "Glimmer", emoji: "🌙", min: 20, blurb: "A hint of something special" },
  { id: "steady", name: "Steady", emoji: "🪨", min: 0, blurb: "Quietly getting on with it" },
];

export type AuraComponent = {
  id: MetricId; label: string; weight: number; raw: number | null; percentile: number; contribution: number;
};
export type PlayerAura = {
  playerId: string; score: number | null; tier: AuraTier | null; provisional: boolean;
  trait: string | null; components: AuraComponent[];
};

export function auraTier(score: number): AuraTier {
  return AURA_TIERS.find(t => score >= t.min) ?? AURA_TIERS[AURA_TIERS.length - 1];
}

function rawValue(p: PlayerCard, id: MetricId): number | null {
  switch (id) {
    case "maximums": return p.scoring_visits > 0 ? p.one_eighty / p.scoring_visits * 100 : null;
    case "heavy": return p.scoring_visits > 0 ? p.hundred_forty_plus / p.scoring_visits * 100 : null;
    case "bigFish": return p.high_finish ?? 0;
    case "speed": return p.recorded_wins > 0 && (p.darts_per_leg_won ?? 0) > 0 ? p.darts_per_leg_won : null;
    case "opening": return p.first_nine_legs > 0 ? p.first_nine_avg : null;
  }
}
function sampleSize(p: PlayerCard, id: MetricId): number {
  switch (id) {
    case "maximums": case "heavy": return p.scoring_visits;
    case "bigFish": return p.legs_played;
    case "speed": return p.recorded_wins;
    case "opening": return p.first_nine_legs;
  }
}

export function buildPlayerAuras(players: PlayerCard[]): Map<string, PlayerAura> {
  const baselines = new Map<MetricId, number | null>();
  for (const m of AURA_METRICS) {
    let total = 0, weight = 0;
    for (const p of players) {
      const v = rawValue(p, m.id), n = sampleSize(p, m.id);
      if (v !== null && n > 0) { total += v * n; weight += n; }
    }
    baselines.set(m.id, weight ? total / weight : null);
  }
  const adjusted = (p: PlayerCard, id: MetricId, prior: number): number | null => {
    const v = rawValue(p, id), base = baselines.get(id) ?? null, n = sampleSize(p, id);
    if (v === null || base === null) return null;
    // A single best finish is an achievement, not a rate, so it is not smoothed.
    return prior > 0 ? adjustPerformanceMetric(v, n, base, prior) : v;
  };

  const qualified = players.filter(p => p.legs_played >= AURA_MIN_LEGS);
  const reference = qualified.length ? qualified : players.filter(p => p.legs_played > 0);
  const out = new Map<string, PlayerAura>();
  for (const p of players) {
    let any = false;
    const components: AuraComponent[] = AURA_METRICS.map(m => {
      const raw = rawValue(p, m.id), adj = adjusted(p, m.id, m.prior);
      let percentile = 50;
      if (adj !== null) {
        any = true;
        const values = reference.map(r => adjusted(r, m.id, m.prior)).filter((v): v is number => v !== null);
        // Lower darts per win is flashier, so flip the axis.
        percentile = m.id === "speed"
          ? performancePercentile(-adj, values.map(v => -v))
          : performancePercentile(adj, values);
        // Not having produced the spectacle at all earns nothing, whatever the field looks like.
        if ((m.id === "maximums" || m.id === "heavy" || m.id === "bigFish") && !(raw! > 0)) percentile = 0;
      }
      return { id: m.id, label: m.label, weight: m.weight, raw, percentile, contribution: m.weight * percentile / 100 };
    });
    const hasRecord = p.legs_played > 0 && any;
    const score = hasRecord ? components.reduce((s, c) => s + c.contribution, 0) : null;
    // Signature trait: the component where they most outshine the field, if it's genuinely strong.
    const best = components.filter(c => c.percentile >= 60)
      .sort((a, b) => b.percentile * b.weight - a.percentile * a.weight)[0];
    out.set(p.player_id, {
      playerId: p.player_id, score, provisional: p.legs_played < AURA_MIN_LEGS,
      tier: score === null ? null : auraTier(score),
      trait: best ? AURA_METRICS.find(m => m.id === best.id)!.trait : null,
      components,
    });
  }
  return out;
}
