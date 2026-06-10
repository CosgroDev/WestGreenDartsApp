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
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#243756" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#93a5c4", fontSize: 12 }} stroke="#33476b" />
            <YAxis tick={{ fill: "#93a5c4", fontSize: 12 }} stroke="#33476b" width={36} />
            <Tooltip
              cursor={{ fill: "rgba(36, 55, 86, 0.4)" }}
              formatter={(value) => [`${value ?? 0}${suffix}`, title]}
              contentStyle={{
                background: "#13223b",
                border: "1px solid #33476b",
                borderRadius: 10,
                color: "#e8eef7"
              }}
              labelStyle={{ color: "#e8eef7", fontWeight: 600 }}
            />
            <Bar dataKey="value" radius={[8, 8, 0, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={color} fillOpacity={i === 0 ? 1 : 0.65} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
