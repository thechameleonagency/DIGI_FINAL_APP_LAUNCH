/** In-memory world-seed progress for UI (not persisted). */

export type WorldSeedProgress = {
  status: 'idle' | 'running' | 'done' | 'error';
  phase: number;
  totalPhases: number;
  label: string;
  error?: string;
};

const TOTAL = 11;

let state: WorldSeedProgress = {
  status: 'idle',
  phase: 0,
  totalPhases: TOTAL,
  label: '',
};

const listeners = new Set<(s: WorldSeedProgress) => void>();

function emit() {
  const snap = { ...state };
  listeners.forEach((l) => l(snap));
}

export function getWorldSeedProgress(): WorldSeedProgress {
  return { ...state };
}

export function subscribeWorldSeedProgress(listener: (s: WorldSeedProgress) => void): () => void {
  listeners.add(listener);
  listener(getWorldSeedProgress());
  return () => listeners.delete(listener);
}

export function reportWorldSeedPhase(phase: number, label: string): void {
  state = {
    status: 'running',
    phase,
    totalPhases: TOTAL,
    label,
  };
  emit();
}

export function reportWorldSeedDone(): void {
  state = {
    status: 'done',
    phase: TOTAL,
    totalPhases: TOTAL,
    label: 'Demo world ready',
  };
  emit();
}

export function reportWorldSeedError(message: string): void {
  state = {
    status: 'error',
    phase: state.phase,
    totalPhases: TOTAL,
    label: 'Seed failed',
    error: message,
  };
  emit();
}

export function resetWorldSeedProgress(): void {
  state = {
    status: 'idle',
    phase: 0,
    totalPhases: TOTAL,
    label: '',
  };
  emit();
}

/** Yield to the browser so the UI can paint between heavy seed phases. */
export function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 0);
    }
  });
}
