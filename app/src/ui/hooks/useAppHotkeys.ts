import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export type HotkeyChord = {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  meta?: boolean;
};

export type AppHotkey = {
  /** Display label, e.g. Ctrl+O */
  shortcut: string;
  chord: HotkeyChord;
  to: string;
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return !!target.closest('[contenteditable="true"]');
}

function chordMatches(e: KeyboardEvent, chord: HotkeyChord): boolean {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const want = chord.key.length === 1 ? chord.key.toLowerCase() : chord.key;
  if (key !== want) return false;
  const mod = e.ctrlKey || e.metaKey;
  if (chord.ctrl || chord.meta) {
    if (!mod) return false;
  } else if (mod) {
    return false;
  }
  if (!!chord.shift !== e.shiftKey) return false;
  return true;
}

/** Global portal hotkeys — skipped while typing in fields or when disabled. */
export function useAppHotkeys(hotkeys: AppHotkey[], enabled: boolean) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!enabled || !hotkeys.length) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (isEditableTarget(e.target)) return;
      for (const hk of hotkeys) {
        if (!chordMatches(e, hk.chord)) continue;
        e.preventDefault();
        navigate(hk.to);
        return;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hotkeys, enabled, navigate]);
}

export function hotkeysFromNav(
  items: { to: string; shortcut?: string; chord?: HotkeyChord }[],
): AppHotkey[] {
  return items
    .filter((i): i is typeof i & { shortcut: string; chord: HotkeyChord } => !!i.shortcut && !!i.chord)
    .map((i) => ({ shortcut: i.shortcut, chord: i.chord, to: i.to }));
}
