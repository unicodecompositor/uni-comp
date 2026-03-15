import { useState, useCallback, useRef } from 'react';

const MAX_HISTORY = 20;

interface HistoryState {
  past: string[];
  future: string[];
}

export function useHistory(initialValue: string) {
  const [current, setCurrent] = useState(initialValue);
  const historyRef = useRef<HistoryState>({ past: [], future: [] });
  // Last committed value in global history (separate from live draft updates)
  const committedRef = useRef(initialValue);
  // Counter to force re-renders when history changes
  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion(v => v + 1), []);

  // Commit a new global state into undo/redo history
  const push = useCallback((value: string) => {
    const h = historyRef.current;
    const committed = committedRef.current;

    if (committed === value) {
      // Keep UI synced, but do not create duplicate history entries
      setCurrent(value);
      return;
    }

    h.past = [...h.past, committed].slice(-MAX_HISTORY);
    h.future = []; // clear future on new commit
    committedRef.current = value;
    setCurrent(value);
    bump();
  }, [bump]);

  // Update current value WITHOUT recording in global history (for drag/live preview)
  const setLive = useCallback((value: string) => {
    setCurrent(value);
  }, []);

  const undo = useCallback(() => {
    const h = historyRef.current;
    if (h.past.length === 0) return null;

    const previous = h.past[h.past.length - 1];
    const committed = committedRef.current;

    h.past = h.past.slice(0, -1);
    h.future = [committed, ...h.future].slice(0, MAX_HISTORY);
    committedRef.current = previous;
    setCurrent(previous);
    bump();

    return previous;
  }, [bump]);

  const redo = useCallback(() => {
    const h = historyRef.current;
    if (h.future.length === 0) return null;

    const next = h.future[0];
    const committed = committedRef.current;

    h.future = h.future.slice(1);
    h.past = [...h.past, committed].slice(-MAX_HISTORY);
    committedRef.current = next;
    setCurrent(next);
    bump();

    return next;
  }, [bump]);

  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;

  return { current, push, setLive, undo, redo, canUndo, canRedo };
}
