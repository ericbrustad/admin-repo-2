// CODEx PATCH — Robust Local Registry + Bootstrap + Fallback
// File: apps/admin/components/CodexDrop.GameDraftsPanel.jsx
//
// Fixes:
//  • Dropdown shows games again (no Supabase needed).
//  • Builds registry from multiple sources:
//      1) Local registry (erix:games:registry)
//      2) Local snapshots (draft/published)
//      3) public/games/index.json  (correct path: "/games/index.json")
//      4) Final fallback: creates "Default Game" locally
//  • Adds “Sync from Public” button to rehydrate after you unzip bundles.
//  • Still fully local-only (Supabase OFF).

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  STARFIELD_DEFAULT,
  slugify,
  assembleLocalGameList,
  getSnapshotFor,
  normalizeGameEntry,
  readSnapshot,
  writeSnapshot,
  deleteSnapshot,
  removeFromRegistry,
  readRegistry,
  writeRegistry,
  upsertRegistryEntry,
  seedConfig,
  seedSuite,
} from '../lib/codex/localRegistry.js';

function setPageTitle(name) {
  if (typeof document !== 'undefined') document.title = `${name || 'Admin'} — Admin`;
}

function getOptionValue(game) {
  if (!game || !game.slug) return '';
  const slug = String(game.slug).trim();
  const channel = game.channel === 'published' ? 'published' : 'draft';
  if (slug === 'default') return 'default::draft';
  return `slug:${slug}::${channel}`;
}

function parseSelectionValue(value) {
  const raw = (value || '').toString().trim();
  if (!raw) return { slug: '', channel: '' };
  if (raw === 'default::draft') return { slug: 'default', channel: 'draft' };
  if (raw.startsWith('slug:')) {
    const [, rest] = raw.split('slug:');
    const [slugPart, channelPart] = rest.split('::');
    return {
      slug: (slugPart || '').trim(),
      channel: channelPart === 'published' ? 'published' : 'draft',
    };
  }
  if (raw.startsWith('id:')) {
    const [idPart, channelPart] = raw.slice(3).split('::');
    return {
      id: (idPart || '').trim(),
      channel: channelPart === 'published' ? 'published' : 'draft',
    };
  }
  return { slug: raw, channel: 'draft' };
}

export default function CodexDropGameDraftsPanel({
  value,
  onChange,
  onCloseAndSave,
  mode = 'draft',
  onStatusChange,
}) {
  const [games, setGames] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [current, setCurrent] = useState(null);

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [channel, setChannel] = useState('draft');
  const bootstrappedRef = useRef(false);

  const makeList = useCallback(async (forceBootstrap = false) => {
    setBusy(true);
    setError(null);
    try {
      const list = await assembleLocalGameList({ forceBootstrap });
      setGames(list);
      if (!list.length) {
        setError('No games available.');
      }
    } catch (err) {
      console.warn('Failed to build local game list', err);
      setGames([
        normalizeGameEntry({ slug: 'default', title: STARFIELD_DEFAULT, channel: 'draft' }),
      ].filter(Boolean));
      setError(err?.message || 'Unable to load games');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    void makeList(false);
  }, [makeList]);

  useEffect(() => {
    if (!games.length) {
      setCurrent(null);
      setTitle('');
      setSlug('');
      setChannel('draft');
      return;
    }
    const parsed = parseSelectionValue(value);
    let found = null;
    if (parsed.slug) {
      found = games.find((g) => g.slug === parsed.slug && g.channel === parsed.channel)
        || games.find((g) => g.slug === parsed.slug);
    } else if (parsed.id) {
      found = games.find((g) => g.id != null && String(g.id) === parsed.id) || null;
    }
    if (!found) {
      found = games[0] || null;
    }
    setCurrent(found);
    if (!found) {
      setTitle('');
      setSlug('');
      setChannel('draft');
      return;
    }
    const effectiveChannel = parsed.channel || found.channel || 'draft';
    const snapshot = getSnapshotFor(found.slug, effectiveChannel) || {};
    const nextTitle = snapshot?.title || found.title || found.slug || STARFIELD_DEFAULT;
    const nextSlug = snapshot?.slug || found.slug;
    const nextChannel = effectiveChannel === 'published' ? 'published' : 'draft';
    setTitle(nextTitle);
    setSlug(nextSlug);
    setChannel(nextChannel);
    setPageTitle(nextTitle);
    const nextValue = getOptionValue({ slug: nextSlug, channel: nextChannel });
    const meta = { ...found, slug: nextSlug, title: nextTitle, channel: nextChannel, tag: nextChannel };
    onChange?.(nextValue, meta);
  }, [games, value, onChange]);

  const options = useMemo(() => {
    const sorted = [...games].sort((a, b) => {
      const nameA = (a?.title || a?.slug || '').toString().toLowerCase();
      const nameB = (b?.title || b?.slug || '').toString().toLowerCase();
      return nameA.localeCompare(nameB);
    });
    return sorted.map((g) => ({
      value: getOptionValue(g),
      label: `${g.title || g.slug}${g.channel === 'published' ? ' (published)' : ' (draft)'}`,
    }));
  }, [games]);

  const selectValue = useMemo(() => {
    if (current) {
      return getOptionValue({ slug: current.slug, channel });
    }
    return typeof value === 'string' ? value : '';
  }, [current, channel, value]);

  const handleSelect = useCallback((val) => {
    const parsed = parseSelectionValue(val);
    let found = null;
    if (parsed.slug) {
      found = games.find((g) => g.slug === parsed.slug && g.channel === parsed.channel)
        || games.find((g) => g.slug === parsed.slug);
    } else if (parsed.id) {
      found = games.find((g) => g.id != null && String(g.id) === parsed.id) || null;
    }
    if (!found) {
      onChange?.('', null);
      setCurrent(null);
      setTitle('');
      setSlug('');
      setChannel('draft');
      setPageTitle('Admin');
      return;
    }
    const useChannel = parsed.channel || found.channel || 'draft';
    const snapshot = getSnapshotFor(found.slug, useChannel) || {};
    const nextTitle = snapshot?.title || found.title || found.slug || STARFIELD_DEFAULT;
    const nextSlug = snapshot?.slug || found.slug;
    const nextChannel = useChannel === 'published' ? 'published' : 'draft';
    setCurrent(found);
    setTitle(nextTitle);
    setSlug(nextSlug);
    setChannel(nextChannel);
    setPageTitle(nextTitle);
    const nextValue = getOptionValue({ slug: nextSlug, channel: nextChannel });
    const meta = { ...found, slug: nextSlug, title: nextTitle, channel: nextChannel, tag: nextChannel };
    onChange?.(nextValue, meta);
    if (nextChannel !== found.channel) {
      onStatusChange?.(nextChannel, meta);
    }
  }, [games, onChange, onStatusChange]);

  const createNew = useCallback(() => {
    const titleInput = typeof window !== 'undefined'
      ? window.prompt('New Game Title')
      : '';
    if (!titleInput) return;
    const baseSlug = slugify(titleInput);
    const taken = new Set((games || []).map((g) => g.slug));
    let nextSlug = baseSlug || 'game';
    let counter = 1;
    while (taken.has(nextSlug)) {
      nextSlug = `${baseSlug}-${++counter}`;
    }
    upsertRegistryEntry({ slug: nextSlug, title: titleInput, channel: 'draft' });
    writeSnapshot(nextSlug, 'draft', {
      title: titleInput,
      slug: nextSlug,
      channel: 'draft',
      config: seedConfig(titleInput, nextSlug),
      suite: seedSuite(),
    });
    void makeList(false).then(() => {
      const nextValue = getOptionValue({ slug: nextSlug, channel: 'draft' });
      setTimeout(() => handleSelect(nextValue), 0);
    });
  }, [games, handleSelect, makeList]);

  const saveDraft = useCallback(() => {
    if (!current) return;
    const nextTitle = title || STARFIELD_DEFAULT;
    const nextSlug = slug || slugify(nextTitle);
    const useChannel = channel === 'published' ? 'published' : 'draft';
    if (nextSlug !== current.slug) {
      const draftSnap = readSnapshot(current.slug, 'draft');
      const pubSnap = readSnapshot(current.slug, 'published');
      if (draftSnap) {
        writeSnapshot(nextSlug, 'draft', { ...draftSnap, title: nextTitle, slug: nextSlug });
        deleteSnapshot(current.slug, 'draft');
      }
      if (pubSnap) {
        writeSnapshot(nextSlug, 'published', { ...pubSnap, title: nextTitle, slug: nextSlug });
        deleteSnapshot(current.slug, 'published');
      }
      const updatedRegistry = readRegistry().map((entry) => (
        entry?.slug === current.slug
          ? { ...entry, slug: nextSlug, title: nextTitle }
          : entry
      ));
      writeRegistry(updatedRegistry);
      setCurrent({ ...current, slug: nextSlug, title: nextTitle });
    } else {
      const existing = readSnapshot(nextSlug, useChannel) || {};
      writeSnapshot(nextSlug, useChannel, { ...existing, title: nextTitle, slug: nextSlug });
    }
    upsertRegistryEntry({ slug: nextSlug, title: nextTitle, channel: useChannel });
    setPageTitle(nextTitle);
    void makeList(false).then(() => {
      const nextValue = getOptionValue({ slug: nextSlug, channel: useChannel });
      setTimeout(() => handleSelect(nextValue), 0);
    });
    if (typeof window !== 'undefined') {
      window.alert('Saved locally.');
    }
  }, [channel, current, handleSelect, makeList, slug, title]);

  const publish = useCallback(() => {
    if (!current) return;
    const nextSlug = slug || current.slug;
    const targetChannel = channel === 'published' ? 'draft' : 'published';
    const confirmMessage = targetChannel === 'published'
      ? `Publish “${title || current.title || nextSlug}”?`
      : `Set “${title || current.title || nextSlug}” back to Draft?`;
    if (typeof window !== 'undefined' && !window.confirm(confirmMessage)) return;
    const existing = readSnapshot(nextSlug, channel) || readSnapshot(nextSlug, 'draft') || {};
    writeSnapshot(nextSlug, targetChannel, {
      ...existing,
      title: title || existing.title || current.title || nextSlug,
      slug: nextSlug,
      channel: targetChannel,
    });
    upsertRegistryEntry({ slug: nextSlug, title: title || current.title || nextSlug, channel: targetChannel });
    setChannel(targetChannel);
    const meta = { ...current, slug: nextSlug, title: title || current.title || nextSlug, channel: targetChannel, tag: targetChannel };
    setCurrent(meta);
    void makeList(false).then(() => {
      const nextValue = getOptionValue({ slug: nextSlug, channel: targetChannel });
      setTimeout(() => handleSelect(nextValue), 0);
    });
    onStatusChange?.(targetChannel, meta);
    if (typeof window !== 'undefined') {
      window.alert(targetChannel === 'published' ? 'Published locally.' : 'Set to Draft locally.');
    }
  }, [channel, current, handleSelect, makeList, onStatusChange, slug, title]);

  const remove = useCallback(() => {
    if (!current) return;
    const promptTitle = current.title || current.slug;
    if (typeof window !== 'undefined' && !window.confirm(`Delete “${promptTitle}”? This cannot be undone.`)) return;
    deleteSnapshot(current.slug, 'draft');
    deleteSnapshot(current.slug, 'published');
    removeFromRegistry(current.slug);
    setCurrent(null);
    setTitle('');
    setSlug('');
    setChannel('draft');
    setPageTitle('Admin');
    onChange?.('', null);
    void makeList(false);
  }, [current, makeList, onChange]);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontWeight: 700 }}>Saved Games (Local)</label>
        <select
          disabled={busy}
          value={selectValue}
          onChange={(event) => handleSelect(event.target.value)}
          style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid #d1d5db', minWidth: 280 }}
        >
          <option value="" disabled>{busy ? 'Loading…' : (options.length ? 'Select a game' : 'No games found')}</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => { void makeList(false); }}
          title="Reload"
          style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8 }}
        >
          ↻ Reload
        </button>
        <button
          type="button"
          onClick={() => { void makeList(true); }}
          title="Sync from public/games/index.json"
          style={{ padding: '8px 10px', border: '1px solid #94a3b8', background: '#f1f5f9', borderRadius: 8 }}
        >
          ⤓ Sync from Public
        </button>
        <button
          type="button"
          onClick={createNew}
          title="Create new local game"
          style={{ padding: '8px 10px', border: '1px solid #94a3b8', background: '#eef2ff', borderRadius: 8 }}
        >
          + New
        </button>
        {error && <div style={{ color: '#b91c1c', fontSize: 12 }}>Error: {error}</div>}
      </div>

      {current ? (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#fff' }}>
          <div style={{ display: 'grid', gap: 10 }}>
            <div>
              <div style={{ marginBottom: 6, fontWeight: 700 }}>Game Title</div>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                style={{ width: '100%', padding: 10, border: '1px solid #d1d5db', borderRadius: 10 }}
                placeholder="Enter game title"
              />
            </div>

            <div>
              <div style={{ marginBottom: 6, fontWeight: 700 }}>Slug</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={slug}
                  onChange={(event) => setSlug(slugify(event.target.value))}
                  style={{ flex: 1, padding: 10, border: '1px solid #d1d5db', borderRadius: 10 }}
                  placeholder="game-slug"
                />
                <button
                  type="button"
                  onClick={() => setSlug(slugify(title))}
                  style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 10 }}
                >
                  Auto
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={saveDraft}
                style={{ padding: '10px 14px', border: '1px solid #16a34a', background: '#dcfce7', borderRadius: 12, fontWeight: 700 }}
              >
                Save (Local)
              </button>
              <button
                type="button"
                onClick={publish}
                style={{ padding: '10px 14px', border: '1px solid #0ea5e9', background: '#e0f2fe', borderRadius: 12, fontWeight: 700 }}
              >
                {channel === 'published' ? 'Set to Draft' : 'Publish (Local)'}
              </button>
              <button
                type="button"
                onClick={remove}
                style={{ padding: '10px 14px', border: '1px solid #ef4444', background: '#fee2e2', color: '#991b1b', borderRadius: 12, fontWeight: 700 }}
              >
                Delete
              </button>
              <div style={{ marginLeft: 'auto', fontSize: 12, color: '#64748b' }}>
                Channel: <strong>{channel}</strong> • Source: <strong>Local</strong>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ color: '#6b7280', fontSize: 13 }}>Select a game or click “+ New”.</div>
      )}
    </div>
  );
}

export function useCodexGames() {
  const [games, setGames] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (!hasStorage()) {
        setGames([]);
        return;
      }
      await ensureRegistryBootstrapped();
      setGames(readRegistry() || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load games';
      setError(message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    reload();
    if (!hasStorage()) return undefined;
    const handler = (event) => {
      const key = event?.key || '';
      if (!key || key === REG_KEY || key.startsWith('erix:admin:drafts') || key.startsWith('erix:admin:published')) {
        reload();
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [reload]);

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
      {busy ? 'Saving…' : label}
    </button>
  );
}

export { useCodexGames } from '../hooks/useCodexGames.js';
