import { useCallback, useRef, useState } from 'react';

/** Prevents double-submit on async UI actions (PH-38). */
export function useBusyAction() {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (lock.current) return undefined;
    lock.current = true;
    setBusy(true);
    try {
      return await fn();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }, []);

  return { busy, run };
}
