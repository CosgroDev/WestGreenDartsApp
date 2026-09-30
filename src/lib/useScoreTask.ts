"use client";
import { useCallback, useRef, useState } from "react";
// Retain the exact closure (and its request ID) for retry after a lost response.
export function useScoreTask() {
  const running = useRef(false);
  const retryTask = useRef<(() => Promise<void>) | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const run = useCallback((task: () => Promise<void>) => {
    if (running.current) return;
    retryTask.current = task; running.current = true;
    setPending(true); setError(null); setSaved(false);
    void task().then(() => { retryTask.current = null; setSaved(true); })
      .catch(e => setError(e instanceof Error ? e.message : "Could not save the score."))
      .finally(() => { running.current = false; setPending(false); });
  }, []);
  const retry = useCallback(() => { if (retryTask.current) run(retryTask.current); }, [run]);
  const clearError = useCallback(() => { setError(null); retryTask.current = null; }, []);
  return { pending, run, error, saved, retry, clearError };
}
