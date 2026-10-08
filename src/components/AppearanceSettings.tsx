"use client";

import { useEffect, useState } from "react";

export const THEME_STORAGE_KEY = "wgd-appearance-v1";

function updateThemeColour(theme: string) {
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#f4f7fa" : "#0b1220");
}

/** Keep open tabs and the browser toolbar in step with the stored preference. */
export function ThemeSync() {
  useEffect(() => {
    updateThemeColour(document.documentElement.dataset.theme || "dark");
    const sync = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
      const theme = event.newValue === "light" ? "light" : "dark";
      document.documentElement.dataset.theme = theme;
      updateThemeColour(theme);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  return null;
}

export function AppearanceSettings() {
  const [theme, setTheme] = useState("dark");
  const [storageWarning, setStorageWarning] = useState(false);
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    const sync = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
      const next = event.newValue === "light" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      setTheme(next);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  function choose(next: "dark" | "light") {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    updateThemeColour(next);
    try { localStorage.setItem(THEME_STORAGE_KEY, next); setStorageWarning(false); }
    catch { setStorageWarning(true); }
  }
  return <section className="card">
    <h2 className="text-lg font-semibold">Appearance</h2>
    <p className="mt-1 text-sm text-slate-600">Choose the theme for this device. Your team’s other devices keep their own choice.</p>
    <fieldset className="mt-4">
      <legend className="sr-only">Colour theme</legend>
      <div className="grid grid-cols-2 gap-3">
        {(["dark", "light"] as const).map(value => <label key={value} className="cursor-pointer">
          <input type="radio" name="theme" value={value} checked={theme === value} onChange={() => choose(value)} className="peer sr-only" />
          <span className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 font-semibold peer-checked:border-emerald-600 peer-checked:bg-emerald-50 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-emerald-600">
            <span aria-hidden="true">{value === "dark" ? "☾" : "☀"}</span>{value === "dark" ? "Dark" : "Light"}
          </span>
        </label>)}
      </div>
    </fieldset>
    <p role="status" className="mt-3 text-sm text-slate-600">{storageWarning ? "Theme changed. This browser could not save your choice; allow local storage to remember it." : "Your choice is saved in this browser."}</p>
  </section>;
}
