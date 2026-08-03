import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Trap Tab focus inside a dialog container; restore focus to the prior element on close. */
export function useFocusTrap<T extends HTMLElement = HTMLElement>(
  active: boolean,
  initialFocusRef?: RefObject<HTMLElement | null>,
) {
  const containerRef = useRef<T | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = containerRef.current;
    if (!node) return;

    const focusables = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute('disabled'));

    const focusInitial = () => {
      const pref = initialFocusRef?.current;
      if (pref && node.contains(pref)) {
        pref.focus();
        return;
      }
      const first = focusables()[0];
      (first ?? node).focus();
    };

    focusInitial();
    const retry = initialFocusRef ? window.setTimeout(focusInitial, 0) : undefined;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (!list.length) {
        e.preventDefault();
        node.focus();
        return;
      }
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (activeEl === firstEl || !node.contains(activeEl)) {
          e.preventDefault();
          lastEl.focus();
        }
      } else if (activeEl === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    node.addEventListener('keydown', onKeyDown);
    return () => {
      if (retry != null) window.clearTimeout(retry);
      node.removeEventListener('keydown', onKeyDown);
      previousFocus.current?.focus?.();
    };
  }, [active, initialFocusRef]);

  return containerRef;
}
