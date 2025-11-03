// apps/admin/components/GameControls.unified.jsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  listDrafts,
  ensureDefaultDraft,
  makeNewDraft,
  getDraftBySlug,
  upsertDraft,
  deleteDraft,
  slugify,
  ensureUniqueSlug,
  setDraftCoverImageFromFile,
} from '../lib/drafts';

// No preview tag, no slug editing UI.
// "Default" remains slug=default and is always listed.
// New Game instantly saves; cover image is saved and recalled locally.

const noop = () => {};

export default function GameControlsUnified({
  setHeaderTitle = noop,
  setSlug = noop,
  onChange = noop,
  onCloseAndSave: onCloseAndSaveProp = noop,
}) {
  const [drafts, setDrafts] = useState([]);
  const [current, setCurrent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saveOK, setSaveOK] = useState(false);
  const [error, setError] = useState('');

  // Ensure default on mount, then load list.
  useEffect(() => {
    ensureDefaultDraft();
    setDrafts(listDrafts());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handler = () => {
      setDrafts(listDrafts());
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  useEffect(() => {
    if (!drafts.length) {
      if (current) setCurrent(null);
      return;
    }

    const defaultFirst = drafts.find(d => d.slug === 'default') || drafts[0];

    if (!current) {
      setCurrent(defaultFirst);
      return;
    }

    const nextMatch = drafts.find(d => d.slug === current.slug);
    if (!nextMatch) {
      setCurrent(defaultFirst);
    } else if (nextMatch !== current) {
      setCurrent(nextMatch);
    }
  }, [drafts, current]);

  // Keep header in sync (no preview tag)
  useEffect(() => {
    if (!current) return;
    setHeaderTitle(current.title);
    setSlug(current.slug);
  }, [current, setHeaderTitle, setSlug]);

  useEffect(() => {
    if (!current) return;
    onChange(`${current.channel || 'draft'}:${current.slug}`, current);
  }, [current, onChange]);

  const options = useMemo(() => {
    const opts = drafts.map(d => ({
      value: d.slug,
      label: d.slug === 'default' ? `${d.title} (Default)` : d.title,
    }));
    return opts;
  }, [drafts]);

  const selectBySlug = useCallback((slug) => {
    const found = getDraftBySlug(slug);
    if (found) setCurrent(found);
  }, []);

  const onNew = useCallback(() => {
    // Create, save, and select immediately.
    const d = makeNewDraft('New Game');
    const list = listDrafts();
    setDrafts(list);
    setCurrent(getDraftBySlug(d.slug));
    setSaveOK(true); setTimeout(() => setSaveOK(false), 900);
  }, []);

  const onTitleChange = useCallback((e) => {
    if (!current) return;
    const nextTitle = e.target.value;
    // Keep slug implicit & stable:
    // - Default keeps slug "default"
    // - Others auto-derive once (only if it was identical to prior derivation)
    let nextSlug = current.slug;
    if (current.slug !== 'default') {
      const derived = slugify(nextTitle) || 'untitled';
      // if current slug looks like it's just the old derived, keep them aligned but unique
      if (current.slug === slugify(current.title) || current.slug.startsWith(slugify(current.title) + '-')) {
        nextSlug = ensureUniqueSlug(derived, current.slug);
      }
    }
    const updated = upsertDraft({ ...current, title: nextTitle, slug: nextSlug });
    setCurrent(updated);
    setDrafts(listDrafts());
    setSaveOK(true); setTimeout(() => setSaveOK(false), 600);
  }, [current]);

  const onCoverImageChange = useCallback(async (e) => {
    if (!current) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setError('');
    try {
      const updated = await setDraftCoverImageFromFile(current.slug, file, { maxDim: 1400 });
      setCurrent(updated);
      setDrafts(listDrafts());
      setSaveOK(true); setTimeout(() => setSaveOK(false), 900);
    } catch (err) {
      setError(String(err?.message || err));
    } finally {
      setBusy(false);
      e.target.value = ''; // reset input
    }
  }, [current]);

  const onCloseAndSave = useCallback(async () => {
    if (!current) return;
    setBusy(true);
    try {
      const saved = upsertDraft(current);
      setCurrent(saved);
      setDrafts(listDrafts());
      await onCloseAndSaveProp(saved);
      setSaveOK(true); setTimeout(() => setSaveOK(false), 1000);
    } catch (err) {
      setError(String(err?.message || err));
    } finally {
      setBusy(false);
    }
  }, [current, onCloseAndSaveProp]);

  const onDelete = useCallback(() => {
    if (!current) return;
    if (current.slug === 'default') {
      alert('Default cannot be deleted.');
      return;
    }
    if (!confirm(`Delete “${current.title}”? This cannot be undone.`)) return;
    deleteDraft(current.slug);
    const next = listDrafts();
    setDrafts(next);
    setCurrent(next.find(d => d.slug === 'default') || next[0] || null);
  }, [current]);

  const onFirmPublish = useCallback(async () => {
    if (!current) return;
    if (!confirm(`Firm Publish “${current.title}”? This will go LIVE.`)) return;
    setBusy(true); setError('');
    try {
      // Publish uses Supabase (server) — still the only time we write remotely
      const res = await fetch('/api/publish-game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: current.title,
          slug: current.slug,
          payload: current.payload,
          // cover image will be uploaded later in your publish pipeline; locally we just store dataUrl
        }),
      });
      if (!res.ok) throw new Error(`Publish failed (${res.status})`);
      await res.json();
      // keep local channel labeled draft for now (you may choose to flip it visually)
      setSaveOK(true); setTimeout(() => setSaveOK(false), 1200);
    } catch (err) {
      setError(String(err?.message || err));
    } finally {
      setBusy(false);
    }
  }, [current]);

  return (
    <div className="flex flex-col gap-3 p-3 border rounded-lg" style={{ maxWidth: 900 }}>
      <div className="flex items-center gap-2">
        <label className="font-medium">Saved Games</label>
        <select
          value={current ? current.slug : ''}
          onChange={(e) => selectBySlug(e.target.value)}
          className="border rounded px-2 py-1"
        >
          {!current && <option value="">— Select —</option>}
          {options.length === 0 && <option value="">(No drafts yet)</option>}
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <button onClick={onNew} className="px-3 py-1 border rounded">+ New Game</button>
      </div>

      {current && (
        <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="flex flex-col">
            <label className="text-sm font-medium">Title</label>
            <input
              type="text"
              value={current.title}
              onChange={onTitleChange}
              className="border rounded px-2 py-1"
              placeholder="Game title"
            />
            <small className="opacity-70 mt-1">
              Tag: {current.slug}{current.slug === 'default' ? ' (Default)' : ''}
            </small>
          </div>

          <div className="flex flex-col">
            <label className="text-sm font-medium">Cover Image</label>
            <input
              type="file"
              accept="image/*"
              onChange={onCoverImageChange}
              className="border rounded px-2 py-1"
              disabled={busy}
            />
            {current.coverImage?.dataUrl && (
              <img
                src={current.coverImage.dataUrl}
                alt="Cover"
                style={{ marginTop: 8, width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 8 }}
              />
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button onClick={onCloseAndSave} disabled={!current || busy} className="px-3 py-1 border rounded">
          Close &amp; Save Settings
        </button>
        <button onClick={onFirmPublish} disabled={!current || busy} className="px-3 py-1 border rounded bg-blue-50">
          Firm Publish “{current?.title ?? ''}”
        </button>
        <button onClick={onDelete} disabled={!current || busy} className="px-3 py-1 border rounded border-red-500">
          Delete “{current?.title ?? ''}”
        </button>
        {saveOK && <span className="text-green-600 text-sm">Saved ✓</span>}
        {!!error && <span className="text-red-600 text-sm">Error: {error}</span>}
      </div>

      <div className="text-xs opacity-70">
        Local save location: <code>localStorage["esxape:drafts:v1"]</code>
      </div>
    </div>
  );
}

export function useCodexGames() {
  const [games, setGames] = useState(() => listDrafts());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const next = listDrafts();
      setGames(next);
      return next;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load drafts';
      setError(message);
      return [];
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    void reload();
    const handler = () => void reload();
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
