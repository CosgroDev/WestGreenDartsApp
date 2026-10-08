"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
const Chart = dynamic(() => import("./BarChartCard").then(module => module.BarChartCard), {
  ssr: false, loading: () => <div className="card h-[280px] text-sm text-slate-600" role="status">Loading chart…</div>
});
type ChartData = { title: string; subtitle?: string; data: { label: string; value: number }[]; color?: string; suffix?: string };
export function PerformanceCharts({ charts }: { charts: ChartData[] }) {
  const [expanded, setExpanded] = useState(false);
  return <details className="card" onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary className="cursor-pointer text-lg font-semibold">Performance charts</summary>
    <p className="mt-2 text-sm text-slate-600">Scoring, finishing and player comparisons</p>
    {expanded && <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">{charts.filter(c => c.data.length).map(c => <Chart key={c.title} {...c} />)}</div>}
  </details>;
}
