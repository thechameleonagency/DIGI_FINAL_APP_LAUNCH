import { useCallback, useState } from 'react';
import { LIST_PAGE_SIZE } from '../components/ListToolkit';

export const PAGE_SIZE_OPTIONS = [12, 24, 36, 50, 100, 200] as const;

export function usePersistedPageSize(storageKey: string, defaultSize = 24) {
  const fullKey = `ds.pageSize.${storageKey}`;
  const [pageSize, setPageSizeState] = useState(() => {
    try {
      const raw = localStorage.getItem(fullKey);
      if (!raw) return defaultSize;
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : defaultSize;
    } catch {
      return defaultSize;
    }
  });

  const setPageSize = useCallback(
    (n: number) => {
      setPageSizeState(n);
      try {
        localStorage.setItem(fullKey, String(n));
      } catch {
        /* ignore quota */
      }
    },
    [fullKey],
  );

  return { pageSize, setPageSize, options: [...PAGE_SIZE_OPTIONS] };
}

/** Legacy default when callers omit pageSize (keeps existing list density). */
export { LIST_PAGE_SIZE };
