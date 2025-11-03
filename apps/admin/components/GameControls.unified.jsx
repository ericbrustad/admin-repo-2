import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listDrafts,
  makeNewDraft,
  getDraftBySlug,
  upsertDraft,
  deleteDraft,
  slugify,
  ensureUniqueSlug,
} from '../lib/drafts';

const noop = () => {};

export default function GameControlsUnified({
  setHeaderTitle = noop,
  setSlug = noop,
  setPreviewTag = noop,
  onChange = noop,
  onCloseAndSave = noop,
}) {
  const [drafts, setDrafts] = useState(() => listDrafts());
  const [current, setCurrent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saveOK, setSaveOK] = useState(false);
  const [error, setError] = useState('');

  const refreshDrafts = useCallback(() => {
    const next = listDrafts();
    setDrafts(next);
    return next;
  }, []);

  useEffect(() => {
    refreshDrafts();
    if (typeof window === 'undefined') return undefined;
    const handler = (event) => {
      if (event.key && !event.key.startsWith('esxape:drafts:v1')) return;
      refreshDrafts();
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [refreshDrafts]);

  useEffect(() => {
    if (!current && drafts.length) {
      setCurrent(drafts[0]);
    } else if (current && drafts.every((draft) => draft.slug !== current.slug)) {
      setCurrent(drafts[0] || null);
    }
  }, [drafts, current]);

  useEffect(() => {
    if (!current) return;
    setHeaderTitle(current.title);
    setSlug(current.slug);
    setPreviewTag(current.channel === 'published' ? 'Published' : 'Draft');
    onChange(
      `${current.channel === 'published' ? 'published' : 'draft'}:${current.slug}`,
      current,
    );
  }, [current, setHeaderTitle, setSlug, setPreviewTag, onChange]);

  const options = useMemo(() => {
    const draftOpts = drafts.map((d) => ({
      group: d.channel === 'published' ? 'Published' : 'Drafts',
      value: `${d.channel === 'published' ? 'published' : 'draft'}:${d.slug}`,
      label: d.title || d.slug,
    }));
    return draftOpts.sort((a, b) => a.label.localeCompare(b.label));
  }, [drafts]);

  const selectByValue = useCallback((value) => {
    if (!value) return;
    const [, slug] = value.split(':');
    const found = getDraftBySlug(slug);
    if (found) {
      setCurrent(found);
    }
  }, []);

  const onNew = useCallback(() => {
    const draft = makeNewDraft('New Game');
    const next = refreshDrafts();
    setCurrent(next.find((it) => it.slug === draft.slug) || draft);
  }, [refreshDrafts]);

  const onTitleChange = useCallback((event) => {
    if (!current) return;
    const nextTitle = event.target.value;
    const base = slugify(nextTitle);
    const wantedSlug = base || current.slug;
    const nextSlug = ensureUniqueSlug(current.slug.startsWith('draft-') ? base : wantedSlug, current.slug);
    const updated = upsertDraft({ ...current, title: nextTitle, slug: nextSlug });
    setCurrent(updated);
    refreshDrafts();
  }, [current, refreshDrafts]);

  const onExplicitSlugEdit = useCallback((event) => {
    if (!current) return;
    const wanted = ensureUniqueSlug(slugify(event.target.value), current.slug);
    const updated = upsertDraft({ ...current, slug: wanted });
    setCurrent(updated);
    refreshDrafts();
  }, [current, refreshDrafts]);

  const onSaveDraft = useCallback(async () => {
    if (!current) return;
    setBusy(true);
    setError('');
    try {
      const saved = upsertDraft(current);
      setCurrent(saved);
      refreshDrafts();
      await onCloseAndSave?.(saved);
      setSaveOK(true);
      setTimeout(() => setSaveOK(false), 1200);
    } catch (err) {
      setError(String(err?.message || err));
    } finally {
      setBusy(false);
    }
  }, [current, onCloseAndSave, refreshDrafts]);

  const onDeleteDraft = useCallback(() => {
    if (!current) return;
    if (!confirm(`Delete draft "${current.title}"? This cannot be undone.`)) return;
    deleteDraft(current.slug);
    const next = refreshDrafts();
    setCurrent(next[0] || null);
  }, [current, refreshDrafts]);

  const onFirmPublish = useCallback(async () => {
    if (!current) return;
    if (!confirm(`Firm Publish "${current.title}"? This will go LIVE.`)) return;
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
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        const reason = payload?.error ? `: ${payload.error}` : '';
        throw new Error(`Publish failed (${res.status})${reason}`);
      }
      upsertDraft({ ...current, channel: 'published' });
      const next = refreshDrafts();
      const updated = next.find((it) => it.slug === current.slug) || {
        ...current,
        channel: 'published',
      };
      setCurrent(updated);
      setSaveOK(true);
      setTimeout(() => setSaveOK(false), 1400);
    } catch (err) {
      setError(String(err?.message || err));
    } finally {
      setBusy(false);
    }
  }, [current, refreshDrafts]);

  return (
    <div className="flex flex-col gap-3 p-3 border rounded-lg" style={{ maxWidth: 900 }}>
      <div className="flex items-center gap-2">
        <label className="font-medium">Saved Games</label>
        <select
          value={current ? `${current.channel === 'published' ? 'published' : 'draft'}:${current.slug}` : ''}
          onChange={(event) => selectByValue(event.target.value)}
          className="border rounded px-2 py-1"
        >
          {!current && <option value="">— Select —</option>}
          {options.length === 0 && <option value="">(No drafts yet)</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.group === 'Drafts' ? '📝 ' : '🌐 '}
              {option.label}
            </option>
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
          </div>
          <div className="flex flex-col">
            <label className="text-sm font-medium">Slug (tag)</label>
            <input
              type="text"
              value={current.slug}
              onChange={onExplicitSlugEdit}
              className="border rounded px-2 py-1"
              placeholder="game-slug"
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button onClick={onSaveDraft} disabled={!current || busy} className="px-3 py-1 border rounded">
          Close &amp; Save Settings
        </button>
        <button onClick={onFirmPublish} disabled={!current || busy} className="px-3 py-1 border rounded bg-blue-50">
          Firm Publish “{current?.title ?? ''}”
        </button>
        <button onClick={onDeleteDraft} disabled={!current || busy} className="px-3 py-1 border rounded border-red-500">
          Delete “{current?.title ?? ''}”
        </button>
        {saveOK && <span className="text-green-600 text-sm">Saved ✓</span>}
        {!!error && <span className="text-red-600 text-sm">Error: {error}</span>}
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
