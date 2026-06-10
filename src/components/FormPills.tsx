type Props = {
  /** Match results, most recent first. */
  form: ("W" | "D" | "L")[];
  max?: number;
};

const STYLES: Record<"W" | "D" | "L", string> = {
  W: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300",
  D: "bg-amber-100 text-amber-700 ring-1 ring-amber-300",
  L: "bg-red-100 text-red-700 ring-1 ring-red-300"
};

/** Football-style form guide; oldest on the left, most recent on the right. */
export function FormPills({ form, max = 5 }: Props) {
  const shown = form.slice(0, max).reverse();
  if (!shown.length) return null;
  return (
    <span className="inline-flex items-center gap-1" aria-label={`Recent form: ${shown.join(", ")}`}>
      {shown.map((r, i) => (
        <span
          key={i}
          className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${STYLES[r]} ${
            i === shown.length - 1 ? "scale-110" : "opacity-80"
          }`}
        >
          {r}
        </span>
      ))}
    </span>
  );
}
