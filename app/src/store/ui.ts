import { useCallback, useState } from 'react';
import { create } from 'zustand';
import type { SuccessSummaryPayload } from '../ui/components/SuccessSummary';

export interface Toast {
  id: string;
  tone: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
  /** Optional undo / reverse action shown on the toast */
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
}

interface UiState {
  toasts: Toast[];
  sidebarOpen: boolean;
  successSummary: SuccessSummaryPayload | null;
  pushToast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
  setSidebarOpen: (v: boolean) => void;
  showSuccessSummary: (payload: SuccessSummaryPayload) => void;
  clearSuccessSummary: () => void;
}

const AUTO_DISMISS_MS = 5000;

export const useUi = create<UiState>((set, get) => ({
  toasts: [],
  sidebarOpen: false,
  successSummary: null,
  pushToast: (t) => {
    const id = `${Date.now()}-${Math.random()}`;
    set((s) => ({
      toasts: [...s.toasts, { ...t, id }],
    }));
    window.setTimeout(() => {
      if (get().toasts.some((x) => x.id === id)) get().dismissToast(id);
    }, AUTO_DISMISS_MS);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  showSuccessSummary: (payload) => set({ successSummary: payload }),
  clearSuccessSummary: () => set({ successSummary: null }),
}));

/** Busy/disabled guard for mutating buttons (F12). */
export function useBusy() {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (busy) return undefined;
    setBusy(true);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  }, [busy]);
  return { busy, run, setBusy };
}
