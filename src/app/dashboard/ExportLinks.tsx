"use client";

import { useMemo, useState } from "react";

type Season = { id: string; name: string; is_current: boolean };
type Fixture = { id: string; season: string; opponent: string };

type Props = {
  seasons: Season[];
  fixtures: Fixture[];
  currentSeasonId?: string;
};

export function ExportLinks({ seasons, fixtures, currentSeasonId }: Props) {
  const [seasonId, setSeasonId] = useState(currentSeasonId || "");
  const [fixtureId, setFixtureId] = useState("");
  const [format, setFormat] = useState<"csv" | "json">("csv");

  const eventsUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("format", format);
    if (fixtureId) params.set("fixture", fixtureId);
    return `/api/exports/events?${params.toString()}`;
  }, [fixtureId, format]);

  const fixturesUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("format", format);
    if (seasonId) params.set("season", seasonId);
    return `/api/exports/fixtures?${params.toString()}`;
  }, [seasonId, format]);

  const playerStatsUrl = useMemo(() => `/api/exports/player-stats?format=${format}`, [format]);

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-slate-600">Season filter</span>
          <select
            value={seasonId}
            onChange={(e) => setSeasonId(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1"
          >
            <option value="">All seasons</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} {s.is_current ? "(current)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-slate-600">Fixture filter</span>
          <select
            value={fixtureId}
            onChange={(e) => setFixtureId(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1"
          >
            <option value="">All fixtures</option>
            {fixtures.map((f) => (
              <option key={f.id} value={f.id}>
                {f.opponent} ({f.season})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-slate-600">Format</span>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as "csv" | "json")}
            className="rounded-md border border-slate-300 px-2 py-1"
          >
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <a className="text-emerald-700 underline" href={eventsUrl}>
          Download scoring events
        </a>
        <a className="text-emerald-700 underline" href={fixturesUrl}>
          Download fixtures
        </a>
        <a className="text-emerald-700 underline" href={playerStatsUrl}>
          Download player stats
        </a>
      </div>
    </div>
  );
}
