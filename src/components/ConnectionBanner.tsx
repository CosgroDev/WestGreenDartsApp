"use client";

import { useEffect, useState } from "react";

/** Tells the scorer when the device has lost its connection, and when it returns. */
export function ConnectionBanner() {
  const [online, setOnline] = useState(true);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const up = () => {
      setOnline(true); setRestored(true);
      timer = setTimeout(() => setRestored(false), 4000);
    };
    const down = () => { setOnline(false); setRestored(false); };
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!online) {
    return (
      <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
        No connection. Scores cannot be saved until it returns — your entry is kept.
      </p>
    );
  }
  return restored ? (
    <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
      Back online.
    </p>
  ) : null;
}
