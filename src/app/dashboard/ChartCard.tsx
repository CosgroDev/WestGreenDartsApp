"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

type Props = {
  title: string;
  data: { label: string; value: number }[];
  color?: string;
};

export function ChartCard({ title, data, color = "#12b886" }: Props) {
  const gradientId = `area-${color.replace("#", "")}`;
  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer>
          <AreaChart data={data}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.7} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#243756" />
            <XAxis dataKey="label" tick={{ fill: "#93a5c4", fontSize: 12 }} stroke="#33476b" />
            <YAxis tick={{ fill: "#93a5c4", fontSize: 12 }} stroke="#33476b" width={36} />
            <Tooltip
              contentStyle={{
                background: "#13223b",
                border: "1px solid #33476b",
                borderRadius: 10,
                color: "#e8eef7"
              }}
              labelStyle={{ color: "#e8eef7", fontWeight: 600 }}
            />
            <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fillOpacity={1} fill={`url(#${gradientId})`} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
