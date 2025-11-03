"use client";

// apps/admin/components/GameControls.unified.jsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listGames,
  listTags,
  ensureDefaultGame,
  getGame,
  upsertGame,
  deleteGame,
  slugify,
  ensureUniqueSlug,
  setCoverFromFile,
  clearCover,
} from '../lib/store';
import MetadataEditor from './MetadataEditor';
import UnifiedTitle from './UnifiedTitle';

const noop = () => {};

export default function GameControlsUnified({
  setHeaderTitle = noop,
  setSlug = noop,
  onChange = noop,
  onCloseAndSave: onCloseAndSaveProp = noop,
}) {
  const [games, setGames] = useState([]);
  const [tags, setTags] = useState([]);
  const [current, setCurrent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    const nextGames = listGames();
    const nextTags = listTags();
    setGames(nextGames);
    setTags(nextTags);
    return nextGames;
  }, []);

  useEffect(() => {
    ensureDefaultGame();
    const nextGames = refresh();
    const first = nextGames.find((g) => g.slug === 'default') || nextGames[0] || null;
    setCurrent(first || null);
  }, [refresh]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handler = () => {
      const nextGames = refresh();
      if (!current) {
        const first = nextGames.find((g) => g.slug === 'default') || nextGames[0] || null;
        if (first) setCurrent(first);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [current, refresh]);

  useEffect(() => {
    if (!games.length) {
      if (current) setCurrent(null);
      return;
    }
    const defaultFirst = games.find((g) => g.slug === 'default') || games[0];
    if (!current) {
      setCurrent(defaultFirst);
      return;
    }
    const nextMatch = games.find((g) => g.slug === current.slug);
    if (!nextMatch) {
      setCurrent(defaultFirst);
    } else if (nextMatch !== current) {
      setCurrent(nextMatch);
    }
  }, [games]);

  useEffect(() => {
    if (!current) return;
    setHeaderTitle(current.title);
    setSlug(current.slug);
  }, [current, setHeaderTitle, setSlug]);

  useEffect(() => {
    if (!current) return;
    onChange(`${current.channel || 'draft'}:${current.slug}`, current);
  }, [current, onChange]);

  const options = useMemo(
    () =>
      games.map((g) => ({
        value: g.slug,
        label: g.slug === 'default' ? `${g.title} (Default)` : g.title,
      })),
    [games],
  );

  const selectSlug = useCallback((slug) => {
    const found = getGame(slug);
    if (found) setCurrent(found);
  }, []);

  const triggerFlash = useCallback((msg, timeout = 900) => {
    setFlash(msg);
    setTimeout(() => setFlash(''), timeout);
  }, []);

  const onMetadataSaved = useCallback(
    (updated) => {
      const nextGames = refresh();
      if (!updated) return;
      const match =
        nextGames.find((g) => g.slug === updated.slug) || getGame(updated.slug) || updated;
      setCurrent(match);
    },
    [refresh],
  );

  const onNew = useCallback(() => {
    const slug = ensureUniqueSlug(slugify('New Game') || 'untitled');
    const saved = upsertGame({ title: 'New Game', slug, channel: 'draft' });
    refresh();
    const record = getGame(saved.slug) || saved;
    setCurrent(record);
    triggerFlash('Saved ✓');
  }, [refresh, triggerFlash]);

  const onTitleDraftChange = useCallback(
    (next) => {
      if (!current) return;
      const nextTitle = typeof next?.title === 'string' ? next.title : '';
      const previewSlug = typeof next?.slug === 'string' ? next.slug : slugify(nextTitle);
      let nextSlug = current.slug;

      if (current.slug !== 'default') {
        const desired = slugify(nextTitle) || previewSlug || 'untitled';
        const oldDerived = slugify(current.title);
        if (current.slug === oldDerived || current.slug.startsWith(`${oldDerived}-`)) {
          nextSlug = ensureUniqueSlug(desired);
        }
      }

      const saved = upsertGame({ ...current, title: nextTitle, slug: nextSlug });
      refresh();
      const record = getGame(saved.slug) || saved;
      setCurrent(record);
    },
    [current, refresh],
  );

  const onCoverChange = useCallback(
    async (e) => {
      if (!current) return;
      const file = e.target.files?.[0];
      if (!file) return;
      setBusy(true);
      setError('');
      try {
        const saved = await setCoverFromFile(current.slug, file, { maxDim: 1400 });
        refresh();
        const record = saved ? getGame(saved.slug) || saved : getGame(current.slug);
        if (record) setCurrent(record);
        triggerFlash('Cover saved ✓');
      } catch (err) {
        setError(String(err?.message || err));
      } finally {
        setBusy(false);
        if (e.target) e.target.value = '';
      }
    },
    [current, refresh, triggerFlash],
  );

  const onClearCover = useCallback(() => {
    if (!current) return;
    const saved = clearCover(current.slug);
    refresh();
    const record = saved ? getGame(saved.slug) || saved : getGame(current.slug);
    if (record) setCurrent(record);
    triggerFlash('Cover removed');
  }, [current, refresh, triggerFlash]);

  const onCloseAndSave = useCallback(async () => {
    if (!current) return;
    setBusy(true);
    setError('');
    try {
      const saved = upsertGame(current);
      refresh();
      const record = getGame(saved.slug) || saved;
      if (record) setCurrent(record);
      await onCloseAndSaveProp(record);
      triggerFlash('Saved ✓', 1000);
    } catch (err) {
      setError(String(err?.message || err));
    } finally {
      setBusy(false);
    }
  }, [current, onCloseAndSaveProp, refresh, triggerFlash]);

  const onDeleteGame = useCallback(() => {
    if (!current) return;
    if (current.slug === 'default') {
      alert('Default cannot be deleted.');
      return;
    }
    if (!confirm(`Delete “${current.title}”? This cannot be undone.`)) return;
    deleteGame(current.slug);
    const nextGames = refresh();
    const next = nextGames.find((g) => g.slug === 'default') || nextGames[0] || null;
    setCurrent(next);
  }, [current, refresh]);

  const onFirmPublish = useCallback(async () => {
    if (!current) return;
    if (!confirm(`Firm Publish “${current.title}”? This will go LIVE.`)) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/publish-game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: current.title,
          slug: current.slug,
          payload: current.payload,
        }),
      });
      if (!res.ok) throw new Error(`Publish failed (${res.status})`);
      triggerFlash('Publish request sent ✓', 1200);
    } catch (err) {
      setError(String(err?.message || err));
    } finally {
      setBusy(false);
    }
  }, [current, triggerFlash]);

  return (
    <div className="flex flex-col gap-3 p-3 border rounded-lg" style={{ maxWidth: 900 }}>
      <div className="flex items-center gap-2">
        <label className="font-medium">Saved Games</label>
        <select
          value={current ? current.slug : ''}
          onChange={(e) => selectSlug(e.target.value)}
          className="border rounded px-2 py-1"
        >
          {!current && <option value="">— Select —</option>}
          {options.length === 0 && <option value="">(No games yet)</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button onClick={onNew} className="px-3 py-1 border rounded">+ New Game</button>
        {flash && <span className="text-green-600 text-sm">{flash}</span>}
        {!!error && <span className="text-red-600 text-sm">Error: {error}</span>}
      </div>

      {current && (
        <>
          <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="flex flex-col">
              <UnifiedTitle
                value={current.title}
                currentSlug={current.slug}
                onChange={onTitleDraftChange}
              />
            </div>

            <div className="flex flex-col">
              <label className="text-sm font-medium">Cover Image</label>
              <input
                type="file"
                accept="image/*"
                onChange={onCoverChange}
                className="border rounded px-2 py-1"
                disabled={busy}
              />
              {current.coverImage?.dataUrl && (
                <>
                  <img
                    src={current.coverImage.dataUrl}
                    alt="Cover"
                    style={{ marginTop: 8, width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 8 }}
                  />
                  <button onClick={onClearCover} className="mt-2 px-3 py-1 border rounded">
                    Remove Cover
                  </button>
                </>
              )}
            </div>
          </div>

          <MetadataEditor key={current.slug} game={current} onSaved={onMetadataSaved} />
        </>
      )}

      <div className="flex items-center gap-2">
        <button onClick={onCloseAndSave} disabled={!current || busy} className="px-3 py-1 border rounded">
          Close &amp; Save Settings
        </button>
        <button onClick={onFirmPublish} disabled={!current || busy} className="px-3 py-1 border rounded bg-blue-50">
          Firm Publish “{current?.title ?? ''}”
        </button>
        <button onClick={onDeleteGame} disabled={!current || busy} className="px-3 py-1 border rounded border-red-500">
          Delete “{current?.title ?? ''}”
        </button>
      </div>

      <div className="text-xs opacity-70">
        Local save location: <code>localStorage["esxape:games:v2"]</code>
        {tags.length ? (
          <>
            {' '}
            • Tags tracked: {tags.join(', ')}
          </>
        ) : null}
      </div>
    </div>
  );
}

export function useCodexGames() {
  const [games, setGames] = useState(() => listGames());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const next = listGames();
      setGames(next);
      return next;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load games';
      setError(message);
      return [];
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    void reload();
    const handler = () => {
      void reload();
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [reload]);

  return { games, busy, error, reload };
}

export const useGames = useCodexGames;

export function CloseAndSaveSettings({ onSave }) {
  const [busy, setBusy] = useState(false);

  const handleClick = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (onSave) {
        await onSave();
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('settings:close'));
      }
    } finally {
      setBusy(false);
    }
  }, [busy, onSave]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      style={{
        padding: '10px 14px',
        borderRadius: 12,
        border: '1px solid #93c5fd',
        background: '#dbeafe',
        color: '#1e40af',
        fontWeight: 800,
        minWidth: 220,
      }}
      title="Save all settings and close"
    >
      {busy ? 'Saving…' : 'Close & Save Settings'}
    </button>
  );
}
