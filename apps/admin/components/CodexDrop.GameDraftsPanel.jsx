// CODEx PATCH — LOCAL-ONLY GAME MANAGER (Supabase disabled)
// File: apps/admin/components/CodexDrop.GameDraftsPanel.jsx
//
// What it does (localStorage only):
// • Shows a Saved Games dropdown (draft + published) from a local registry
// • Create New Game (title -> auto slug), seed minimal config
// • Rename title, auto-slugify (optional)
// • Publish / Unpublish (channel flip) — still local
// • Delete game (removes registry + draft/published snapshots)
// • Keeps document title in sync
//
// Keys used:
//  - erix:games:registry                  Array<{slug,title,channel}>
//  - erix:admin:drafts:slug:<slug>       { title, slug, channel, config?, suite? }
//  - erix:admin:published:slug:<slug>    same as above for published
//
// Optional bootstrap:
//  - If registry is empty, it will try to read /public/games/index.json once
//    and hydrate the local registry from there (best effort; safe to ignore).
//
// NOTE: This panel emits onChange(value, game) but stays fully local.
//       You can hook it into your header/state as before.

import React, { useEffect, useMemo, useState, useCallback } from 'react';

const REG_KEY = 'erix:games:registry';
const DRAFT_KEY = (slug) => `erix:admin:drafts:slug:${slug}`;
const PUB_KEY   = (slug) => `erix:admin:published:slug:${slug}`;

const STARFIELD_DEFAULT = 'Starfield Station Break';

const hasStorage = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
let registryBootstrapAttempted = false;

async function ensureRegistryBootstrapped() {
  if (registryBootstrapAttempted) return;
  if (!hasStorage()) return;
  const existing = readRegistry();
  if (existing && existing.length) {
    registryBootstrapAttempted = true;
    return;
  }
  registryBootstrapAttempted = true;
  try {
    const res = await fetch('/public/games/index.json', { cache: 'no-store' });
    if (!res.ok) return;
    const idx = await res.json();
    if (!Array.isArray(idx)) return;
    idx.forEach((g) => {
      const slug = g?.slug || '';
      if (!slug) return;
      const title = g?.title || slug;
      upsertRegistryEntry({ slug, title, channel: 'draft' });
      const snap = readSnapshot(slug, 'draft') || { title, slug, channel: 'draft' };
      writeSnapshot(slug, 'draft', snap);
    });
  } catch {}
}

// --------- utils ----------
function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'untitled';
}
function setPageTitle(name) {
  if (typeof document !== 'undefined') document.title = `${name || 'Admin'} — Admin`;
}
function loadJSON(key, fallback = null) {
  if (!hasStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function saveJSON(key, value) {
  if (!hasStorage()) return;
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
function removeKey(key) {
  if (!hasStorage()) return;
  try { window.localStorage.removeItem(key); } catch {}
}
function nowIso() { return new Date().toISOString(); }

// minimal local config/suite seeds (safe defaults)
function seedConfig(title, slug) {
  return {
    splash: { enabled: false, mode: 'single' },
    game: {
      title,
      slug,
      mode: 'single',
      coverImage: '',
      tags: [slug],
      shortDescription: '',
      longDescription: ''
    },
    forms: { players: 1 },
    timer: { durationMinutes: 0, alertMinutes: 5 },
    map: { centerLat: 44.9778, centerLng: -93.2650, defaultZoom: 13 },
    geofence: { mode: 'test' },
    icons: { missions: [], devices: [], rewards: [] },
    devices: []
  };
}
function seedSuite() {
  return { version: '1.0.0', missions: [] };
}

// --------- Local registry helpers ----------
function readRegistry() {
  return loadJSON(REG_KEY, []);
}
function writeRegistry(list) {
  const clean = Array.isArray(list) ? list : [];
  saveJSON(REG_KEY, clean);
  return clean;
}
function upsertRegistryEntry({ slug, title, channel = 'draft' }) {
  const list = readRegistry();
  const idx = list.findIndex((g) => (g.slug || '') === slug);
  const entry = { slug, title, channel: channel === 'published' ? 'published' : 'draft', updated_at: nowIso() };
  if (idx >= 0) list[idx] = { ...list[idx], ...entry };
  else list.push(entry);
  return writeRegistry(list);
}
function removeFromRegistry(slug) {
  const list = readRegistry().filter((g) => (g.slug || '') !== slug);
  return writeRegistry(list);
}

// --------- Snapshots (draft/published) ----------
function readSnapshot(slug, channel) {
  return loadJSON(channel === 'published' ? PUB_KEY(slug) : DRAFT_KEY(slug), null);
}
function writeSnapshot(slug, channel, payload) {
  const key = channel === 'published' ? PUB_KEY(slug) : DRAFT_KEY(slug);
  saveJSON(key, { ...(payload || {}), slug, channel, saved_at: nowIso() });
}
function deleteSnapshot(slug, channel) {
  const key = channel === 'published' ? PUB_KEY(slug) : DRAFT_KEY(slug);
  removeKey(key);
}

// --------- Component ----------
export default function CodexDropGameDraftsPanel({
  value,
  onChange,        // (value, gameMeta)
  onCloseAndSave,  // not used here but preserved
}) {
  const [games, setGames] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [current, setCurrent] = useState(null);

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [channel, setChannel] = useState('draft');

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

  useEffect(() => { reload(); }, [reload]);

  // Current selection resolution
  useEffect(() => {
    const found = games.find((g) =>
      String(g.slug) === String(value) ||
      String(g.slug) === String(slug) ||
      (String(value || '').startsWith('slug:') && String(value).slice(5).split('::')[0] === g.slug)
    ) || (games.length ? games[0] : null);

    setCurrent(found || null);

    if (found) {
      const useChannel = found.channel === 'published' ? 'published' : 'draft';
      const snap = readSnapshot(found.slug, useChannel) || readSnapshot(found.slug, 'draft') || { title: found.title, slug: found.slug, channel: useChannel };
      setTitle(snap?.title || found.title || found.slug || STARFIELD_DEFAULT);
      setSlug(snap?.slug || found.slug);
      setChannel(useChannel);
      setPageTitle(snap?.title || found.title || found.slug);
      // Inform parent (value as slug)
      onChange?.(found.slug, { ...found });
    } else {
      setTitle('');
      setSlug('');
      setChannel('draft');
    }
  }, [value, games, onChange]);

  // Dropdown options
  const options = useMemo(() => {
    const sorted = [...games].sort((a,b) => String(a.title||a.slug).localeCompare(String(b.title||b.slug)));
    return sorted.map((g) => ({
      value: g.slug,
      label: `${g.title || g.slug}${g.channel === 'published' ? ' (published)' : ' (draft)'}`
    }));
  }, [games]);

  // Actions
  const handleSelect = (val) => {
    const found = games.find((g) => g.slug === val) || null;
    setCurrent(found);
    if (found) {
      const useChannel = found.channel === 'published' ? 'published' : 'draft';
      const snap = readSnapshot(found.slug, useChannel) || readSnapshot(found.slug, 'draft') || { title: found.title, slug: found.slug, channel: useChannel };
      setTitle(snap?.title || found.title || found.slug);
      setSlug(snap?.slug || found.slug);
      setChannel(useChannel);
      setPageTitle(snap?.title || found.title || found.slug);
      onChange?.(val, { ...found });
    } else {
      onChange?.('', null);
    }
  };

  const createNew = () => {
    const t = prompt('New Game Title');
    if (!t) return;
    const s = slugify(t);
    // ensure unique slug
    const base = s || 'game';
    let final = base; let i=1;
    const taken = new Set((readRegistry() || []).map(g=>g.slug));
    while (taken.has(final)) { final = `${base}-${++i}`; }
    upsertRegistryEntry({ slug: final, title: t, channel: 'draft' });
    writeSnapshot(final, 'draft', { title: t, slug: final, channel: 'draft', config: seedConfig(t, final), suite: seedSuite() });
    reload();
    setTimeout(()=>handleSelect(final), 0);
  };

  const saveDraft = () => {
    if (!current) return;
    const s = slug || slugify(title);
    // If slug changed, migrate registry + snapshots
    if (s !== current.slug) {
      // migrate snapshots
      const dSnap = readSnapshot(current.slug, 'draft');
      const pSnap = readSnapshot(current.slug, 'published');
      if (dSnap) { writeSnapshot(s, 'draft', { ...dSnap, title, slug: s }); deleteSnapshot(current.slug, 'draft'); }
      if (pSnap) { writeSnapshot(s, 'published', { ...pSnap, title, slug: s }); deleteSnapshot(current.slug, 'published'); }
      // update registry
      const list = readRegistry().map((g) => g.slug === current.slug ? { ...g, slug: s, title } : g);
      writeRegistry(list);
      setCurrent({ ...current, slug: s, title });
    } else {
      // just update snapshot + registry title
      const snap = readSnapshot(s, channel) || { title, slug: s, channel };
      writeSnapshot(s, channel, { ...snap, title, slug: s });
      upsertRegistryEntry({ slug: s, title, channel });
    }
    setPageTitle(title);
    reload();
    alert('Saved locally.');
  };

  const publish = () => {
    if (!current) return;
    const s = slug || current.slug;
    const confirmMsg = channel === 'published'
      ? `Unpublish “${title}”? It will switch to (draft).`
      : `Publish “${title}”? It will switch to (published).`;
    if (!confirm(confirmMsg)) return;

    const target = channel === 'published' ? 'draft' : 'published';
    const snap = readSnapshot(s, channel) || { title, slug: s, channel };
    writeSnapshot(s, target, { ...snap, title, slug: s, channel: target });

    upsertRegistryEntry({ slug: s, title, channel: target });
    setChannel(target);
    reload();
  };

  const remove = () => {
    if (!current) return;
    if (!confirm(`Delete “${current.title}”? This cannot be undone.`)) return;
    deleteSnapshot(current.slug, 'draft');
    deleteSnapshot(current.slug, 'published');
    removeFromRegistry(current.slug);
    reload();
    setCurrent(null); setTitle(''); setSlug(''); setPageTitle('Admin');
    onChange?.('', null);
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label style={{ fontWeight: 700 }}>Saved Games (Local)</label>
        <select
          disabled={busy}
          value={current?.slug || ''}
          onChange={(e) => handleSelect(e.target.value)}
          style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid #d1d5db', minWidth: 280 }}
        >
          <option value="" disabled>{busy ? 'Loading…' : (options.length ? 'Select a game' : 'No games found')}</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <button type="button" onClick={reload} title="Reload" style={{ padding: '8px 10px', border: '1px solid #d1d5db' }}>↻</button>
        <button type="button" onClick={createNew} title="Create new local game" style={{ padding: '8px 10px', border: '1px solid #94a3b8', background: '#f1f5f9' }}>+ New</button>
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
                onChange={(e)=>setTitle(e.target.value)}
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
                  onChange={(e)=>setSlug(slugify(e.target.value))}
                  style={{ flex: 1, padding: 10, border: '1px solid #d1d5db', borderRadius: 10 }}
                  placeholder="game-slug"
                />
                <button type="button" onClick={()=>setSlug(slugify(title))} style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 10 }}>Auto</button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="button" onClick={saveDraft} style={{ padding: '10px 14px', border: '1px solid #16a34a', background: '#dcfce7', borderRadius: 12, fontWeight: 700 }}>Save (Local)</button>
              <button type="button" onClick={publish} style={{ padding: '10px 14px', border: '1px solid #0ea5e9', background: '#e0f2fe', borderRadius: 12, fontWeight: 700 }}>
                {channel === 'published' ? 'Set to Draft' : 'Publish (Local)'}
              </button>
              <button type="button" onClick={remove} style={{ padding: '10px 14px', border: '1px solid #ef4444', background: '#fee2e2', color:'#991b1b', borderRadius: 12, fontWeight: 700 }}>Delete</button>
              <div style={{ marginLeft: 'auto', fontSize: 12, color: '#64748b' }}>
                Channel: <strong>{channel}</strong> • Supabase: <strong>OFF</strong>
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

  return { games, busy, error, reload };
}

export function CloseAndSaveSettings({ onSave, label = 'Close & Save Settings' }) {
  const [busy, setBusy] = useState(false);

  const handleClick = useCallback(async () => {
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
  }, [onSave]);

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
