import { create } from 'zustand';

export interface Toast {
  id: string;
  tone: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
}

interface UiState {
  toasts: Toast[];
  sidebarOpen: boolean;
  pushToast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
  setSidebarOpen: (v: boolean) => void;
}

export const useUi = create<UiState>((set) => ({
  toasts: [],
  sidebarOpen: true,
  pushToast: (t) =>
    set((s) => ({
      toasts: [...s.toasts, { ...t, id: `${Date.now()}-${Math.random()}` }],
    })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
}));
