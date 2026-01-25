type StatBarProps = {
  label: string;
  value: number | null;
  max?: number;
  suffix?: string;
};

export function StatBar({ label, value, max = 180, suffix = "" }: StatBarProps) {
  const pct = value !== null && value !== undefined && max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-sm text-slate-600">
        <span>{label}</span>
        <span className="font-semibold text-slate-800 ml-2">
          {value !== null && value !== undefined ? `${value.toFixed(1)}${suffix}` : "-"}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
