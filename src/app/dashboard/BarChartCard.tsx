"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

type Props = {
  title: string;
  subtitle?: string;
  data: { label: string; value: number }[];
  color?: string;
  /** Append to values in the tooltip, e.g. "%" */
  suffix?: string;
};

export function BarChartCard({ title, subtitle, data, color = "#12b886", suffix = "" }: Props) {
  return (
    <div className="card">
      <h3 className="text-lg font-semibold">{title}</h3>
      {subtitle && <p className="text-xs text-slate-500 mb-2">{subtitle}</p>}
      <div style={{ width: "100%", height: 220 }} className={subtitle ? "" : "mt-2"}>
        <ResponsiveContainer>
          <BarChart data={data} accessibilityLayer>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 12 }} stroke="var(--border)" />
            <YAxis tick={{ fill: "var(--text-muted)", fontSize: 12 }} stroke="var(--border)" width={36} />
            <Tooltip
              cursor={{ fill: "var(--surface-raised)" }}
              formatter={(value) => [`${value ?? 0}${suffix}`, title]}
              contentStyle={{
                background: "var(--surface-raised)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "10px 14px",
                boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                color: "var(--text)"
              }}
              labelStyle={{ color: "var(--text)", fontWeight: 700, fontSize: 14, marginBottom: 4 }}
              itemStyle={{ color: "var(--text)", fontWeight: 600, fontSize: 13, padding: 0 }}
            />
            <Bar dataKey="value" radius={[8, 8, 0, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={color === "#ffd43b" || color === "#d9a52b" ? "var(--chart-gold, #b8860b)" : color === "#9775fa" ? "var(--chart-purple, #9775fa)" : "var(--chart-green, #227256)"} fillOpacity={i === 0 ? 1 : 0.65} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-3 rounded-lg border border-slate-200 p-3 text-sm">
        <summary className="cursor-pointer font-semibold">View chart data</summary>
        <table className="mt-3 w-full text-left"><caption className="sr-only">{title}</caption>
          <thead><tr><th scope="col" className="py-2">Player / leg</th><th scope="col" className="py-2 text-right">{title}</th></tr></thead>
          <tbody>{data.map((entry, index) => <tr key={`${entry.label}-${index}`} className="border-t border-slate-200"><th scope="row" className="py-2 pr-3 font-normal">{entry.label}</th><td className="py-2 text-right tabular-nums">{entry.value}{suffix}</td></tr>)}</tbody>
        </table>
        {!data.length && <p>No recorded values.</p>}
      </details>
    </div>
  );
}
