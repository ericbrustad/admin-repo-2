// CODEx DROP — Game Drafts Panel (unified dropdown + draft saving + publish)
// File: apps/admin/components/CodexDrop.GameDraftsPanel.jsx
// No new deps. Works on Vercel. Drafts are stored client-side (localStorage).
// Optional: if you later add POST /api/drafts/save, this will sync there too.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// ---------- Supabase (for PUBLISH only) ----------
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

// ---------- Utilities ----------
function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'untitled';
}

function normalizedChannel(game) {
  const tag = String(game?.tag || '').toLowerCase();
  const channel = String(game?.channel || '').toLowerCase();
  return tag === 'published' || channel === 'published' ? 'published' : 'draft';
}

function normalizeGame(game) {
  if (!game) return null;
  const channel = normalizedChannel(game);
  const rawSlug = typeof game.slug === 'string' ? game.slug.trim() : '';
  const configSlug = typeof game?.config?.game?.slug === 'string' ? game.config.game.slug.trim() : '';
  const slug = rawSlug || configSlug || (channel === 'draft' ? 'default' : '');
  const defaultChannelRaw = typeof game.default_channel === 'string' ? game.default_channel.toLowerCase() : '';
  const default_channel = defaultChannelRaw === 'published' ? 'published' : 'draft';
  const cover_image = game.cover_image
    ?? game.coverImage
    ?? (game.config && game.config.game ? game.config.game.coverImage : null);
  const appearance_skin = game.appearance_skin ?? game.appearanceSkin ?? null;
  const appearance_tone = game.appearance_tone ?? game.appearanceTone ?? null;
  const config = game.config && typeof game.config === 'object' ? game.config : null;
  const appearance = game.appearance && typeof game.appearance === 'object'
    ? game.appearance
    : config && typeof config.appearance === 'object'
      ? config.appearance
      : null;
  const map = game.map && typeof game.map === 'object'
    ? game.map
    : config && typeof config.map === 'object'
      ? config.map
      : null;
  const settings = game.settings && typeof game.settings === 'object' ? game.settings : {};
  const api_active = typeof game.api_active === 'boolean' ? game.api_active : channel === 'published';

  return {
    id: game.id ?? null,
    slug,
    title: game.title ?? config?.game?.title ?? (slug || 'Untitled'),
    channel,
    tag: channel,
    default_channel,
    api_active,
    updated_at: game.updated_at ?? null,
    published_at: game.published_at ?? null,
    cover_image,
    coverImage: cover_image,
    appearance_skin,
    appearance_tone,
    appearance,
    map,
    theme: game.theme && typeof game.theme === 'object' ? game.theme : null,
    settings,
    config,
    source: game.source || 'supabase',
    game_enabled: typeof game.game_enabled === 'boolean' ? game.game_enabled : undefined,
  };
}

function optionValueFor(game) {
  if (!game) return '';
  if (game.slug === 'default') return 'default::draft';
  const channel = normalizedChannel(game);
  if (game.id != null) return `id:${game.id}::${channel}`;
  if (game.slug) return `slug:${game.slug}::${channel}`;
  return '';
}

function ensureDefaultOption(options) {
  const hasDefault = options.some((entry) => entry.value === 'default::draft' || entry.slug === 'default');
  if (hasDefault) return options;
  const defaultGame = {
    id: null,
    slug: 'default',
    title: 'Default Game',
    channel: 'draft',
    tag: 'draft',
    api_active: false,
    source: 'virtual',
  };
  return [
    {
      value: 'default::draft',
      label: 'Default Game (draft)',
      game: defaultGame,
      slug: 'default',
      channel: 'draft',
    },
    ...options,
  ];
}

// ---------- Draft Store (client-side) ----------
const LS_PREFIX = 'erix:admin:drafts';

function draftKey(game) {
  const id = game?.id != null ? `id:${game.id}` : (game?.slug ? `slug:${game.slug}` : 'unknown');
  return `${LS_PREFIX}:${id}`;
}

function loadDraft(game) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(draftKey(game));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function saveDraft(game, payload) {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(draftKey(game), JSON.stringify(payload));
    } catch {}
  }
  try {
    await fetch('/api/drafts/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: draftKey(game), payload }),
      credentials: 'include',
    }).catch(() => {});
  } catch {}
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('drafts:saved', { detail: { key: draftKey(game) } }));
  }
}

// ---------- Source: list games ----------
async function loadGamesFromSupabase() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error('Supabase configuration missing');
  }
  const { data, error } = await supabase
    .from('games')
    .select(`
      id, slug, title, tag, channel, api_active, updated_at, published_at,
      default_channel, game_enabled, cover_image, appearance_skin, appearance_tone,
      settings, config, appearance, theme, map
    `)
    .in('channel', ['draft', 'published'])
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message || 'Supabase list failed');
  return (data || []).map(normalizeGame).filter(Boolean);
}

async function loadGamesFromFilesystem() {
  const res = await fetch('/api/games/list', { credentials: 'include', cache: 'no-store' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !Array.isArray(body?.games)) return [];
  return (body.games || [])
    .map((entry) => normalizeGame({ ...entry, id: entry.id ?? null, source: 'filesystem' }))
    .filter(Boolean);
}

export async function listCodexGames() {
  try {
    const supabaseGames = await loadGamesFromSupabase();
    if (supabaseGames.length) return supabaseGames;
  } catch {}
  try {
    const filesystemGames = await loadGamesFromFilesystem();
    if (filesystemGames.length) return filesystemGames;
  } catch {}
  return [];
}

// ---------- Publish / Draft switches (DB writes) ----------
async function setDraftMode(gameId) {
  return supabase
    .from('games')
    .update({ api_active: false, channel: 'draft', published_at: null })
    .eq('id', gameId);
}

async function publishLive(gameId, title, slug) {
  const now = new Date().toISOString();
  return supabase
    .from('games')
    .update({
      title: title || null,
      slug: slug || null,
      channel: 'published',
      api_active: true,
      published_at: now,
    })
    .eq('id', gameId);
}

// ---------- Hooks ----------
export function useCodexGames() {
  const [games, setGames] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await listCodexGames();
      setGames(next);
    } catch (err) {
      setError(err?.message || 'Failed to load games');
      setGames([]);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { games, busy, error, reload };
}

// ---------- UI: Status pill ----------
function StatusPill({ channel }) {
  const isPublished = channel === 'published';
  const style = {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    background: isPublished ? '#e6ffed' : '#eef2ff',
    color: isPublished ? '#036d19' : '#3730a3',
    border: `1px solid ${isPublished ? '#9ae6b4' : '#c7d2fe'}`,
  };
  return <span style={style}>{isPublished ? 'published' : 'draft'}</span>;
}

// ---------- Close & Save button ----------
export function CloseAndSaveSettings({ onSave }) {
  const [busy, setBusy] = useState(false);

  const handleClick = useCallback(async () => {
    setBusy(true);
    try {
      if (typeof onSave === 'function') {
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
      {busy ? 'Saving…' : 'Close & Save Settings'}
    </button>
  );
}

// ---------- MAIN PANEL ----------
export default function CodexDropGameDraftsPanel({
  value,
  onChange,
  onCloseAndSave,
  onStatusChange,
}) {
  const { games, busy, error, reload } = useCodexGames();

  const current = useMemo(() => {
    if (!value) return null;
    if (value === 'default::draft') {
      return {
        id: null,
        slug: 'default',
        title: 'Default Game',
        channel: 'draft',
        tag: 'draft',
        api_active: false,
      };
    }
    if (typeof value === 'string' && value.startsWith('id:')) {
      const payload = value.slice(3);
      const [idValue] = payload.split('::');
      return games.find((game) => String(game?.id ?? '') === idValue) || null;
    }
    if (typeof value === 'string' && value.startsWith('slug:')) {
      const payload = value.slice(5);
      const [slugValue, channelValue] = payload.split('::');
      const normalizedValueChannel = channelValue === 'published' ? 'published' : 'draft';
      return (
        games.find(
          (game) => (game.slug || '') === (slugValue || '') && normalizedChannel(game) === normalizedValueChannel,
        )
        || games.find((game) => (game.slug || '') === (slugValue || ''))
        || null
      );
    }
    return games.find((game) => optionValueFor(game) === value || String(game?.id ?? '') === String(value)) || null;
  }, [games, value]);

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const previewTag = useMemo(() => slugify(title), [title]);

  useEffect(() => {
    if (!current) return;
    const draft = loadDraft(current);
    const startTitle = draft?.title ?? current.title ?? '';
    const startSlug = draft?.slug ?? current.slug ?? (current.channel === 'draft' ? 'default' : '');
    setTitle(startTitle);
    setSlug(startSlug);
  }, [current?.id, current?.slug, current?.channel]);

  const options = useMemo(() => {
    const seen = new Set();
    const base = games.map((game) => {
      const channel = normalizedChannel(game);
      const label = `${game.title ?? game.slug ?? 'Untitled'}${channel === 'published' ? ' (published)' : ' (draft)'}`;
      const optionValue = optionValueFor(game);
      if (!optionValue) return null;
      const key = `${optionValue}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return { value: optionValue, label, game };
    }).filter(Boolean);
    return ensureDefaultOption(base);
  }, [games]);

  const handleSelect = useCallback((event) => {
    const nextValue = event.target.value || '';
    const found = options.find((option) => option.value === nextValue);
    if (typeof onChange === 'function') {
      onChange(nextValue, found?.game || null);
    }
  }, [onChange, options]);

  const handleSaveTitle = useCallback(async () => {
    if (!current) return;
    const next = { ...current, title, slug };
    await saveDraft(current, { title: next.title, slug: next.slug });
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert('Draft saved (local).');
    }
  }, [current, slug, title]);

  const handleCloseAndSave = useCallback(async () => {
    if (current) {
      await saveDraft(current, { title, slug });
    }
    if (typeof onCloseAndSave === 'function') {
      await onCloseAndSave();
    }
  }, [current, onCloseAndSave, slug, title]);

  const handleSetDraft = useCallback(async () => {
    if (!current?.id) return;
    const { error: supabaseError } = await setDraftMode(current.id);
    if (supabaseError) {
      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert(`Failed to switch to Draft: ${supabaseError.message || supabaseError}`);
      }
      return;
    }
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(`“${current.title}” is now Draft (APIs disabled).`);
    }
    if (typeof onStatusChange === 'function') {
      onStatusChange('draft', current);
    }
    await reload();
  }, [current, onStatusChange, reload]);

  const handleFirmPublish = useCallback(async () => {
    if (!current?.id) return;
    const confirmed = typeof window !== 'undefined' && typeof window.confirm === 'function'
      ? window.confirm(
        `Firm Publish “${title || current.title}”?\n\nThis will:\n• set channel=published\n• enable APIs\n• save title/slug to DB`,
      )
      : true;
    if (!confirmed) return;
    await saveDraft(current, { title, slug });
    const targetSlug = slug || slugify(title || current.title);
    const { error: supabaseError } = await publishLive(current.id, title || current.title, targetSlug);
    if (supabaseError) {
      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert(`Publish failed: ${supabaseError.message || supabaseError}`);
      }
      return;
    }
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(`“${title || current.title}” is now LIVE.`);
    }
    if (typeof onStatusChange === 'function') {
      onStatusChange('published', { ...current, title: title || current.title, slug: targetSlug });
    }
    await reload();
  }, [current, onStatusChange, reload, slug, title]);

  const currentChannel = current ? normalizedChannel(current) : 'draft';

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label style={{ fontWeight: 700, fontSize: 14 }}>Saved Games</label>
        <select
          disabled={busy}
          value={value || ''}
          onChange={handleSelect}
          style={{
            padding: '8px 10px',
            borderRadius: 10,
            border: '1px solid #d1d5db',
            minWidth: 280,
          }}
        >
          <option value="" disabled>{busy ? 'Loading…' : 'Choose a game'}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={reload}
          style={{
            padding: '8px 10px',
            borderRadius: 10,
            border: '1px solid #d1d5db',
            background: '#f3f4f6',
          }}
          title="Reload list"
        >
          ↻
        </button>
        {current ? (
          <div style={{ marginLeft: 10 }}>
            <StatusPill channel={currentChannel} />
          </div>
        ) : null}
        {error ? <div style={{ color: '#b91c1c', fontSize: 12, marginLeft: 8 }}>Error: {error}</div> : null}
      </div>

      <div style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 14, background: '#fff' }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Game Title</div>
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Enter game title"
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid #d1d5db',
            outline: 'none',
          }}
        />
        <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
          <div style={{ marginBottom: 4 }}>
            <strong>Current Tag:</strong> <code>{slug || 'default'}</code>
          </div>
          <div>
            <strong>Preview Tag:</strong> <code>{previewTag}</code>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            type="button"
            onClick={() => setSlug(slugify(title))}
            style={{
              padding: '8px 12px',
              borderRadius: 10,
              border: '1px solid #d1d5db',
              background: '#eef2ff',
              fontWeight: 600,
            }}
          >
            Use Preview Tag
          </button>
          <button
            type="button"
            onClick={handleSaveTitle}
            style={{
              padding: '8px 12px',
              borderRadius: 10,
              border: '1px solid #16a34a',
              background: '#dcfce7',
              fontWeight: 800,
            }}
          >
            Save Title (Draft)
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {currentChannel === 'published' ? (
          <button
            type="button"
            onClick={handleSetDraft}
            style={{
              padding: '8px 12px',
              borderRadius: 10,
              border: '1px solid #eab308',
              background: '#fffbeb',
              fontWeight: 700,
            }}
          >
            Set to Draft mode (disable APIs)
          </button>
        ) : (
          <button
            type="button"
            onClick={handleFirmPublish}
            disabled={!current?.id}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid #0ea5e9',
              background: '#ecfeff',
              fontWeight: 800,
            }}
            title={!current?.id ? 'Select a saved game with an ID to publish' : 'Publish and go live'}
          >
            Firm Publish “{title || current?.title || 'Untitled'}”
          </button>
        )}

        <div style={{ flex: 1 }} />

        <CloseAndSaveSettings onSave={handleCloseAndSave} />
      </div>
    </div>
  );
}
