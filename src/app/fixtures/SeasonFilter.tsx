"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

type Props = {
  seasonNames: string[];
  selected: string;
};

export function SeasonFilter({ seasonNames, selected }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex min-w-0 items-center gap-2">
      <label className="text-sm text-slate-600" htmlFor="seasonFilter">
        Season
      </label>
      <select
        id="seasonFilter"
        value={selected}
        disabled={pending}
        onChange={(e) => {
          const value = e.target.value;
          startTransition(() => {
            router.push(`/fixtures?season=${encodeURIComponent(value)}`);
          });
        }}
        className="input min-w-0 flex-1 py-2 text-sm"
      >
        <option value="all">All seasons</option>
        {seasonNames.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );
}
