import { useLiveQuery } from 'dexie-react-hooks';

/** Live Dexie array that distinguishes loading (`undefined`) from empty (`[]`). */
export function useLiveArray<T>(
  querier: () => Promise<T[]> | T[],
  deps: unknown[] = [],
): { items: T[]; loading: boolean } {
  const result = useLiveQuery(querier, deps);
  return { items: result ?? [], loading: result === undefined };
}
