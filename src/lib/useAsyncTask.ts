"use client";
import { useCallback, useRef, useState } from "react";

// This guard stays busy
// until the request settles and also rejects clicks before React re-renders.
export function useAsyncTask(): [boolean, (task: () => Promise<void>) => void] {
  const running = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const run = useCallback((task: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setPending(true);
    task().catch(e => setError(e instanceof Error ? e : new Error("The request failed. Please reload and try again."))).finally(() => {
      running.current = false;
      setPending(false);
    });
  }, []);
  if (error) throw error;
  return [pending, run];
}
