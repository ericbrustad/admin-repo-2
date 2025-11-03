// CODEx PATCH — Local-only Game Manager (stable cover, working close/save)
// File: apps/admin/components/CodexDrop.GameDraftsPanel.jsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const REG_KEY = 'erix:games:registry';
const DRAFT_KEY = (slug) => `erix:admin:drafts:slug:${slug}`;
const PUB_KEY = (slug) => `erix:admin:published:slug:${slug}`;
const STARFIELD_DEFAULT = 'Starfield Station Break';

// ---------- Safe localStorage helpers ----------
function getLS() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function loadJSON(key, fallback = null) {
  const ls = getLS();
  if (!ls) return fallback;
  try {
    const raw = ls.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  const ls = getLS();
  if (!ls) return;
  try {
    ls.setItem(key, JSON.stringify(value));
  } catch {}
}

function removeKey(key) {
  const ls = getLS();
  if (!ls) return;
  try {
    ls.removeItem(key);
  } catch {}
}

function allKeys() {
  const ls = getLS();
  if (!ls) return [];
  try {
    return Object.keys(ls);
  } catch {
    return [];
  }
}

const nowIso = () => new Date().toISOString();
const applyAdminPageTitle = (name) => {
  if (typeof document !== 'undefined') {
    document.title = `${name || 'Admin'} — Admin`;
  }
};

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'untitled';
}

// ---------- Registry & Snapshots ----------
function readRegistry() {
  return loadJSON(REG_KEY, []);
}

function writeRegistry(list) {
  const clean = Array.isArray(list) ? list.filter(Boolean) : [];
  saveJSON(REG_KEY, clean);
  return clean;
}

function upsertRegistryEntry({ slug, title, channel = 'draft' }) {
  const list = readRegistry();
  const idx = list.findIndex((g) => (g.slug || '') === slug);
  const entry = {
    slug,
    title,
    channel: channel === 'published' ? 'published' : 'draft',
    updated_at: nowIso(),
    source: 'local',
  };
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...entry };
  } else {
    list.push(entry);
  }
  return writeRegistry(list);
}

function removeFromRegistry(slug) {
  return writeRegistry(
    (readRegistry() || []).filter((g) => (g.slug || '') !== slug),
  );
}

function readSnapshot(slug, channel) {
  const key = channel === 'published' ? PUB_KEY(slug) : DRAFT_KEY(slug);
  return loadJSON(key, null);
}

function writeSnapshot(slug, channel, payload) {
  const key = channel === 'published' ? PUB_KEY(slug) : DRAFT_KEY(slug);
  saveJSON(key, { ...(payload || {}), slug, channel, saved_at: nowIso() });
}

function deleteSnapshot(slug, channel) {
  const key = channel === 'published' ? PUB_KEY(slug) : DRAFT_KEY(slug);
  removeKey(key);
}

// ---------- Seeds ----------
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
      longDescription: '',
    },
    forms: { players: 1 },
    timer: { durationMinutes: 0, alertMinutes: 5 },
    map: { centerLat: 44.9778, centerLng: -93.265, defaultZoom: 13 },
    geofence: { mode: 'test' },
    icons: { missions: [], devices: [], rewards: [] },
    media: { rewardsPool: [], penaltiesPool: [] },
    devices: [],
  };
}

function seedSuite() {
  return { version: '1.0.0', missions: [] };
}

// ---------- List assembly shared by panel + hook ----------
function ensureDefaultGameExists() {
  let list = readRegistry();
  if (Array.isArray(list) && list.length) {
    return writeRegistry(list);
  }
  const slug = 'default';
  const title = 'Default Game';
  upsertRegistryEntry({ slug, title, channel: 'draft' });
  writeSnapshot(slug, 'draft', {
    title,
    slug,
    channel: 'draft',
    config: seedConfig(title, slug),
    suite: seedSuite(),
  });
  return readRegistry();
}

function assembleLocalGameList() {
  let list = readRegistry() || [];
  const seen = new Set(list.map((g) => g && g.slug));

  for (const key of allKeys()) {
    if (
      !(
        key.startsWith('erix:admin:drafts:slug:') ||
        key.startsWith('erix:admin:published:slug:')
      )
    ) {
      continue;
    }
    const snap = loadJSON(key, null);
    const slug = snap?.slug ? String(snap.slug).trim() : '';
    if (!slug) continue;
    const channel = snap?.channel === 'published' || key.includes(':published:')
      ? 'published'
      : 'draft';
    const title = snap?.title ? String(snap.title).trim() : slug;

    if (seen.has(slug)) {
      list = list.map((game) => {
        if ((game?.slug || '') !== slug) return game;
        return {
          ...game,
          title: game.title || title,
          channel: game.channel === 'published' ? 'published' : channel,
          updated_at: game.updated_at || nowIso(),
        };
      });
    } else {
      list.push({
        slug,
        title,
        channel,
        updated_at: nowIso(),
        source: 'local',
      });
      seen.add(slug);
    }
  }

  if (!list.length) {
    list = ensureDefaultGameExists() || [];
  } else {
    writeRegistry(list);
  }

  return list;
}

// ---------- File -> data URL (stable) ----------
function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Unable to read file'));
    reader.readAsDataURL(file);
  });
}

export default function CodexDropGameDraftsPanel({
  value,
  onChange,
  onCloseAndSave,
}) {
  const [games, setGames] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const [current, setCurrent] = useState(null);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [channel, setChannel] = useState('draft');
  const [coverPreview, setCoverPreview] = useState('');

  const fileInputRef = useRef(null);

  const reload = useCallback(() => {
    setBusy(true);
    setError(null);
    try {
      const list = assembleLocalGameList();
      setGames(list);
    } catch (err) {
      console.warn('CodexDropGameDraftsPanel reload failed', err);
      setError(err?.message || 'Unable to load local games');
      setGames([]);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!games.length) {
      setCurrent(null);
      setTitle('');
      setSlug('');
      setChannel('draft');
      setCoverPreview('');
      return;
    }

    const found =
      games.find((game) => game.slug === value) ||
      games[0];
    setCurrent(found || null);

    if (found) {
      const useChannel = found.channel === 'published' ? 'published' : 'draft';
      const snapshot =
        readSnapshot(found.slug, useChannel) ||
        readSnapshot(found.slug, 'draft') || {
          title: found.title,
          slug: found.slug,
          channel: useChannel,
        };
      const config = snapshot?.config || null;
      const derivedTitle = snapshot?.title || found.title || found.slug || STARFIELD_DEFAULT;
      const derivedSlug = snapshot?.slug || found.slug;
      setTitle(derivedTitle);
      setSlug(derivedSlug);
      setChannel(useChannel);
      setCoverPreview(config?.game?.coverImage || '');
      applyAdminPageTitle(derivedTitle);
      onChange?.(found.slug, { ...found });
    }
  }, [games, value, onChange]);

  const handleSelect = (nextSlug) => {
    const found = games.find((game) => game.slug === nextSlug) || null;
    setCurrent(found);
    if (found) {
      const useChannel = found.channel === 'published' ? 'published' : 'draft';
      const snapshot =
        readSnapshot(found.slug, useChannel) ||
        readSnapshot(found.slug, 'draft') || {
          title: found.title,
          slug: found.slug,
          channel: useChannel,
        };
      const config = snapshot?.config || null;
      setTitle(snapshot?.title || found.title || found.slug);
      setSlug(snapshot?.slug || found.slug);
      setChannel(useChannel);
      setCoverPreview(config?.game?.coverImage || '');
      applyAdminPageTitle(snapshot?.title || found.title || found.slug);
      onChange?.(nextSlug, { ...found });
    } else {
      onChange?.('', null);
    }
  };

  const persist = useCallback(() => {
    if (!current) return false;
    const resolvedSlug = slug || slugify(title);

    if (resolvedSlug !== current.slug) {
      const draftSnapshot = readSnapshot(current.slug, 'draft');
      const publishedSnapshot = readSnapshot(current.slug, 'published');

      if (draftSnapshot) {
        writeSnapshot(resolvedSlug, 'draft', {
          ...draftSnapshot,
          title,
          slug: resolvedSlug,
        });
        deleteSnapshot(current.slug, 'draft');
      }
      if (publishedSnapshot) {
        writeSnapshot(resolvedSlug, 'published', {
          ...publishedSnapshot,
          title,
          slug: resolvedSlug,
        });
        deleteSnapshot(current.slug, 'published');
      }

      const updated = (readRegistry() || []).map((game) =>
        (game.slug === current.slug)
          ? { ...game, slug: resolvedSlug, title }
          : game,
      );
      writeRegistry(updated);
      setCurrent({ ...current, slug: resolvedSlug, title });
    } else {
      const existing =
        readSnapshot(resolvedSlug, channel) ||
        { title, slug: resolvedSlug, channel };
      const config = existing.config || seedConfig(title, resolvedSlug);
      config.game = {
        ...(config.game || {}),
        title,
        slug: resolvedSlug,
        coverImage: coverPreview || '',
      };
      writeSnapshot(resolvedSlug, channel, {
        ...existing,
        title,
        slug: resolvedSlug,
        config,
      });
      upsertRegistryEntry({ slug: resolvedSlug, title, channel });
    }

    applyAdminPageTitle(title);
    reload();
    return true;
  }, [channel, coverPreview, current, reload, slug, title]);

  const save = () => {
    if (persist()) {
      alert('Saved locally.');
    }
  };

  const publish = () => {
    if (!current) return;
    const resolvedSlug = slug || current.slug;
    const target = channel === 'published' ? 'draft' : 'published';
    const message = channel === 'published'
      ? `Unpublish “${title}”?`
      : `Publish “${title}”?`;
    if (!confirm(message)) return;

    const existing =
      readSnapshot(resolvedSlug, channel) ||
      { title, slug: resolvedSlug, channel };
    const config = existing.config || seedConfig(title, resolvedSlug);
    writeSnapshot(resolvedSlug, target, {
      ...existing,
      title,
      slug: resolvedSlug,
      channel: target,
      config,
    });
    upsertRegistryEntry({ slug: resolvedSlug, title, channel: target });
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
    setCurrent(null);
    setTitle('');
    setSlug('');
    setCoverPreview('');
    applyAdminPageTitle('Admin');
    onChange?.('', null);
  };

  const onPickFile = async (event) => {
    const file = event?.target?.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataURL(file);
    setCoverPreview(dataUrl);
  };

  const saveCoverImage = () => {
    if (!current) return;
    const ok = persist();
    if (ok) {
      alert('Cover image saved locally.');
    }
  };

  const removeCoverImage = () => {
    setCoverPreview('');
    const ok = persist();
    if (ok) {
      alert('Cover image removed.');
    }
  };

  const closeAndSave = async () => {
    persist();
    try {
      await onCloseAndSave?.();
    } catch {}
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('settings:close'));
    }
  };

  const createNewGame = () => {
    const titlePrompt = typeof window !== 'undefined'
      ? window.prompt('New Game Title')
      : '';
    if (!titlePrompt) return;
    const base = slugify(titlePrompt);
    const taken = new Set((readRegistry() || []).map((game) => game.slug));
    let nextSlug = base || 'game';
    let i = 1;
    while (taken.has(nextSlug)) {
      nextSlug = `${base}-${++i}`;
    }
    upsertRegistryEntry({ slug: nextSlug, title: titlePrompt, channel: 'draft' });
    writeSnapshot(nextSlug, 'draft', {
      title: titlePrompt,
      slug: nextSlug,
      channel: 'draft',
      config: seedConfig(titlePrompt, nextSlug),
      suite: seedSuite(),
    });
    reload();
    setTimeout(() => handleSelect(nextSlug), 0);
  };

  const options = useMemo(() => {
    const sorted = [...games].sort((a, b) =>
      String(a.title || a.slug).localeCompare(String(b.title || b.slug)),
    );
    return sorted.map((game) => ({
      value: game.slug,
      label: `${game.title || game.slug}${
        game.channel === 'published' ? ' (published)' : ' (draft)'
      }`,
    }));
  }, [games]);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label style={{ fontWeight: 700 }}>Saved Games (Local)</label>
        <select
          disabled={busy}
          value={current?.slug || ''}
          onChange={(event) => handleSelect(event.target.value)}
          style={{
            padding: '8px 10px',
            borderRadius: 10,
            border: '1px solid #d1d5db',
            minWidth: 280,
          }}
        >
          <option value="" disabled>
            {busy ? 'Loading…' : options.length ? 'Select a game' : 'No games found'}
          </option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={reload}
          title="Reload"
          style={{ padding: '8px 10px', border: '1px solid #d1d5db' }}
        >
          ↻ Reload
        </button>
        <button
          type="button"
          title="+ New local game"
          onClick={createNewGame}
          style={{
            padding: '8px 10px',
            border: '1px solid #94a3b8',
            background: '#eef2ff',
          }}
        >
          + New
        </button>
        {error && (
          <div style={{ color: '#b91c1c', fontSize: 12 }}>Error: {error}</div>
        )}
      </div>

      {current ? (
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            padding: 12,
            background: '#fff',
          }}
        >
          <div style={{ display: 'grid', gap: 10 }}>
            <div>
              <div style={{ marginBottom: 6, fontWeight: 700 }}>Game Title</div>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                style={{
                  width: '100%',
                  padding: 10,
                  border: '1px solid #d1d5db',
                  borderRadius: 10,
                }}
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
                  style={{
                    flex: 1,
                    padding: 10,
                    border: '1px solid #d1d5db',
                    borderRadius: 10,
                  }}
                  placeholder="game-slug"
                />
                <button
                  type="button"
                  onClick={() => setSlug(slugify(title))}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #cbd5e1',
                    borderRadius: 10,
                  }}
                >
                  Auto
                </button>
              </div>
            </div>

            <div
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 10,
                padding: 10,
                background: '#fafafa',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}
              >
                <div style={{ fontWeight: 700 }}>Cover Image</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  Stored locally in snapshot
                </div>
              </div>
              <div
                style={{
                  display: 'grid',
                  gap: 10,
                  gridTemplateColumns: '1fr auto',
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    minHeight: 120,
                    border: '1px solid #e5e7eb',
                    borderRadius: 10,
                    display: 'grid',
                    placeItems: 'center',
                    background: '#fff',
                  }}
                >
                  {coverPreview ? (
                    <img
                      src={coverPreview}
                      alt="cover"
                      style={{
                        maxWidth: '100%',
                        maxHeight: 240,
                        objectFit: 'contain',
                        borderRadius: 8,
                      }}
                    />
                  ) : (
                    <div style={{ color: '#64748b', fontSize: 13 }}>
                      No cover selected
                    </div>
                  )}
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      padding: '8px 12px',
                      border: '1px solid #94a3b8',
                      borderRadius: 10,
                      background: '#f8fafc',
                    }}
                  >
                    Upload…
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={onPickFile}
                  />
                  <button
                    type="button"
                    onClick={saveCoverImage}
                    style={{
                      padding: '8px 12px',
                      border: '1px solid #16a34a',
                      background: '#dcfce7',
                      borderRadius: 10,
                      fontWeight: 700,
                    }}
                  >
                    Save Cover Image
                  </button>
                  <button
                    type="button"
                    onClick={removeCoverImage}
                    style={{
                      padding: '8px 12px',
                      border: '1px solid #ef4444',
                      background: '#fee2e2',
                      color: '#991b1b',
                      borderRadius: 10,
                      fontWeight: 700,
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                onClick={save}
                style={{
                  padding: '10px 14px',
                  border: '1px solid #16a34a',
                  background: '#dcfce7',
                  borderRadius: 12,
                  fontWeight: 700,
                }}
              >
                Save (Local)
              </button>
              <button
                type="button"
                onClick={publish}
                style={{
                  padding: '10px 14px',
                  border: '1px solid #0ea5e9',
                  background: '#e0f2fe',
                  borderRadius: 12,
                  fontWeight: 700,
                }}
              >
                {channel === 'published' ? 'Set to Draft' : 'Publish (Local)'}
              </button>
              <button
                type="button"
                onClick={remove}
                style={{
                  padding: '10px 14px',
                  border: '1px solid #ef4444',
                  background: '#fee2e2',
                  color: '#991b1b',
                  borderRadius: 12,
                  fontWeight: 700,
                }}
              >
                Delete
              </button>
              <div style={{ flex: 1 }} />
              <button
                type="button"
                onClick={closeAndSave}
                style={{
                  padding: '10px 14px',
                  border: '1px solid #93c5fd',
                  background: '#dbeafe',
                  color: '#1e40af',
                  borderRadius: 12,
                  fontWeight: 800,
                  minWidth: 220,
                }}
              >
                Close &amp; Save Settings
              </button>
            </div>

            <div style={{ fontSize: 12, color: '#64748b' }}>
              Channel: <strong>{channel}</strong> • Source: <strong>Local</strong>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ color: '#6b7280', fontSize: 13 }}>
          Select a game or click “+ New”.
        </div>
      )}
    </div>
  );
}

export function useCodexGames() {
  const [games, setGames] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    if (typeof window === 'undefined') {
      const fallback = [
        { slug: 'default', title: STARFIELD_DEFAULT, channel: 'draft', source: 'local' },
      ];
      setGames(fallback);
      return fallback;
    }

    setBusy(true);
    setError(null);
    try {
      const list = assembleLocalGameList();
      setGames(list);
      return list;
    } catch (err) {
      console.warn('useCodexGames failed to load games', err);
      const fallback = [
        { slug: 'default', title: STARFIELD_DEFAULT, channel: 'draft', source: 'local' },
      ];
      setGames(fallback);
      setError(err?.message || 'Unable to load games');
      return fallback;
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    load();
  }, [load]);

  const reload = useCallback(() => load(), [load]);

  return { games, busy, error, reload };
}

export function CloseAndSaveSettings({ onSave }) {
  const [busy, setBusy] = useState(false);

  const handleClick = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (typeof onSave === 'function') {
        const result = onSave();
        if (result && typeof result.then === 'function') {
          await result;
        }
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
    >
      {busy ? 'Saving…' : 'Close & Save Settings'}
    </button>
  );
}
