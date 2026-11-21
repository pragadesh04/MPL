'use client';

import { useEffect, useRef } from 'react';

/**
 * Console keyboard shortcuts (§7.6): `1`–`9` fallback bid for team N, `S` sold, `U` unsold,
 * `Space` pause / resume, `N` next soldier, `Ctrl+Z` undo, `?` cheat sheet. Keys are ignored while
 * typing in a field, while any dialog or listbox is open, and on key repeat.
 */
export interface ConsoleShortcutHandlers {
  bidForTeam: (index: number) => void;
  sold: () => void;
  unsold: () => void;
  togglePause: () => void;
  next: () => void;
  undo: () => void;
  help: () => void;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function overlayOpen(): boolean {
  return document.querySelector('[role="dialog"], [role="alertdialog"], [role="listbox"]') !== null;
}

export function useConsoleShortcuts(handlers: ConsoleShortcutHandlers, enabled: boolean): void {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || e.repeat || e.altKey) return;
      if (isTyping(e.target) || overlayOpen()) return;
      const h = latest.current;
      const key = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        if (key === 'z' && !e.shiftKey) {
          e.preventDefault();
          h.undo();
        }
        return;
      }
      if (/^[1-9]$/.test(e.key)) {
        e.preventDefault();
        h.bidForTeam(Number(e.key) - 1);
        return;
      }
      const keymap: Partial<Record<string, () => void>> = {
        s: h.sold,
        u: h.unsold,
        n: h.next,
        ' ': h.togglePause,
        '?': h.help,
      };
      const action = keymap[key];
      if (action) {
        e.preventDefault();
        action();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
