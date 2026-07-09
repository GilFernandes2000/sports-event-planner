import { useEffect, useRef } from "react";

/**
 * Calls `fn` every `ms` milliseconds while `enabled` is true.
 * Skips ticks while the tab is hidden and fires a catch-up call
 * when the tab becomes visible again.
 */
export function usePolling(fn: () => void, ms: number, enabled = true): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (!document.hidden) fnRef.current();
    };
    const id = setInterval(tick, ms);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [ms, enabled]);
}
