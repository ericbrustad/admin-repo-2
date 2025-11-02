import { useCallback, useEffect, useState } from 'react';
import {
  assembleLocalGameList,
  normalizeGameEntry,
  STARFIELD_DEFAULT,
} from '../lib/codex/localRegistry.js';

export function useCodexGames() {
  const [games, setGames] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (forceBootstrap = false) => {
    if (typeof window === 'undefined') {
      const fallback = [
        normalizeGameEntry({ slug: 'default', title: STARFIELD_DEFAULT, channel: 'draft' }),
      ].filter(Boolean);
      setGames(fallback);
      return fallback;
    }
    setBusy(true);
    setError(null);
    try {
      const list = await assembleLocalGameList({ forceBootstrap });
      setGames(list);
      return list;
    } catch (err) {
      console.warn('useCodexGames failed to load games', err);
      const fallback = [
        normalizeGameEntry({ slug: 'default', title: STARFIELD_DEFAULT, channel: 'draft' }),
      ].filter(Boolean);
      setGames(fallback);
      setError(err?.message || 'Unable to load games');
      return fallback;
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    void load(false);
  }, [load]);

  const reload = useCallback((forceBootstrap = false) => load(forceBootstrap), [load]);

  return { games, busy, error, reload };
}
