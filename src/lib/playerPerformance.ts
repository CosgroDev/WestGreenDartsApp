import type { PlayerCard } from "@/data/stats";

// Explicit team policy, not fitted coefficients or a probability of winning.
export const PERFORMANCE_METRICS = [
  { id: "results", label: "Leg win rate", weight: 35, prior: 12, unit: "legs", percent: true },
  { id: "average", label: "Three-dart average", weight: 25, prior: 90, unit: "darts", percent: false },
  { id: "opening", label: "First 9 average", weight: 15, prior: 6, unit: "opening nines", percent: false },
  { id: "finishing", label: "Checkout visit success", weight: 15, prior: 20, unit: "finishing visits", percent: true },
  { id: "tons", label: "100+ visit rate", weight: 10, prior: 60, unit: "visits", percent: true },
] as const;
export const PERFORMANCE_MIN_LEGS = 6;
export const PERFORMANCE_MIN_VISITS = 30;
type MetricId = typeof PERFORMANCE_METRICS[number]["id"];
export type PerformanceComponent = {
  id: MetricId; label: string; weight: number; prior: number; unit: string; percent: boolean;
  raw: number | null; sample: number; baseline: number | null; adjusted: number | null;
  dataWeight: number; percentile: number; contribution: number;
};
export type PlayerPerformance = {
  playerId: string; score: number | null; qualified: boolean; rank: number | null;
  reasons: string[]; components: PerformanceComponent[];
};
export type PerformanceLeaderboard = { ratings: PlayerPerformance[]; referenceCount: number; usingProvisionalReference: boolean };

function observation(p: PlayerCard, id: MetricId): { value: number | null; sample: number } {
  let value: number | null, sample: number;
  switch (id) {
    case "results": sample=p.legs_played; value=sample>0?p.legs_won/sample*100:null; break;
    case "average": sample=p.total_darts; value=p.three_dart_avg; break;
    case "opening": sample=p.first_nine_legs; value=p.first_nine_avg; break;
    case "finishing": sample=p.checkout_attempts; value=sample>0?p.checkout_hits/sample*100:null; break;
    case "tons": sample=p.scoring_visits; value=sample>0?p.hundred_plus/sample*100:null; break;
  }
  // Missing evidence stays missing; a recorded zero remains a valid observation.
  if (!(sample>0) || value===null || !Number.isFinite(value)) return { value:null,sample:0 };
  return { value, sample };
}
export function adjustPerformanceMetric(value: number, sample: number, baseline: number, prior: number) {
  return (sample*value+prior*baseline)/(sample+prior);
}
// Midrank empirical percentiles: ties share credit; a tied/one-player field is 50.
export function performancePercentile(value: number | null, reference: number[]): number {
  if (value===null || !reference.length) return 50;
  const below=reference.filter(v=>v<value-1e-9).length;
  const equal=reference.filter(v=>Math.abs(v-value)<=1e-9).length;
  return 100*(below+equal/2)/reference.length;
}
export function buildPerformanceLeaderboard(players: PlayerCard[]): PerformanceLeaderboard {
  const baselines=new Map<MetricId,number|null>();
  for(const metric of PERFORMANCE_METRICS){
    const observations=players.map(p=>observation(p,metric.id)).filter(o=>o.value!==null);
    const sample=observations.reduce((n,o)=>n+o.sample,0);
    baselines.set(metric.id,sample?observations.reduce((n,o)=>n+o.value!*o.sample,0)/sample:null);
  }
  const ratings:PlayerPerformance[]=players.map(p=>{
    const components=PERFORMANCE_METRICS.map(metric=>{
      const {value:raw,sample}=observation(p,metric.id),baseline=baselines.get(metric.id)!;
      return {...metric,raw,sample,baseline,
        adjusted:raw===null||baseline===null?null:adjustPerformanceMetric(raw,sample,baseline,metric.prior),
        dataWeight:sample/(sample+metric.prior),percentile:50,contribution:metric.weight/2};
    });
    const reasons:string[]=[];
    if(p.legs_played<PERFORMANCE_MIN_LEGS)reasons.push(`Needs ${PERFORMANCE_MIN_LEGS} completed legs (${p.legs_played} recorded)`);
    if(p.scoring_visits<PERFORMANCE_MIN_VISITS)reasons.push(`Needs ${PERFORMANCE_MIN_VISITS} recorded visits (${p.scoring_visits} recorded)`);
    for(const c of components)if(c.raw===null)reasons.push(`No recorded ${c.label.toLowerCase()} evidence`);
    return {playerId:p.player_id,score:null,qualified:reasons.length===0,rank:null,reasons,components};
  });
  const qualified=ratings.filter(r=>r.qualified);
  const reference=qualified.length?qualified:ratings.filter(r=>r.components.some(c=>c.raw!==null));
  for(const metric of PERFORMANCE_METRICS){
    const values=reference.map(r=>r.components.find(c=>c.id===metric.id)!.adjusted).filter((v):v is number=>v!==null);
    for(const rating of ratings){
      const c=rating.components.find(c=>c.id===metric.id)!;
      c.percentile=performancePercentile(c.adjusted,values);
      c.contribution=c.weight*c.percentile/100;
    }
  }
  for(const r of ratings)if(r.components.some(c=>c.raw!==null))r.score=r.components.reduce((total,c)=>total+c.contribution,0);
  const byId=new Map(players.map(p=>[p.player_id,p]));
  ratings.sort((a,b)=>Number(b.qualified)-Number(a.qualified)||(b.score??-1)-(a.score??-1)||
    byId.get(a.playerId)!.name.localeCompare(byId.get(b.playerId)!.name)||a.playerId.localeCompare(b.playerId));
  let position=0;
  ratings.forEach((r,index)=>{
    if(!r.qualified)return;
    const previous=ratings[index-1];
    if(!previous?.qualified||Math.abs(previous.score!-r.score!)>1e-9)position=index+1;
    r.rank=position;
  });
  return {ratings,referenceCount:reference.length,usingProvisionalReference:qualified.length===0};
}
