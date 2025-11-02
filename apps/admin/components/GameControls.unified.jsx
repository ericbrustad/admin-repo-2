// CODEx PATCH — Unified Saved Games + Firm Publish + Close&Save
// File: apps/admin/components/GameControls.unified.jsx
// This patch removes the duplicate dropdowns, adds a single unified picker,
// introduces a Firm Publish flow, and replaces "Back" with "Close & Save Settings".
// No new dependencies required.

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

// --- Supabase client (browser anon) -----------------------------------------
// If you already have a client helper, replace this with your import,
// e.g. `import { supabase } from '@/lib/supabase-browser'`
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// --- tiny helpers ------------------------------------------------------------
function normalizedTag(game) {
  const rawTag = typeof game?.tag === 'string' ? game.tag.toLowerCase() : '';
  const rawChannel = typeof game?.channel === 'string' ? game.channel.toLowerCase() : '';
  return rawTag === 'published' || rawChannel === 'published' ? 'published' : 'draft';
}

function normalizeGame(game) {
  if (!game) return null;

  const rawSlug = typeof game.slug === 'string' ? game.slug.trim() : '';
  const configSlug = typeof game?.config?.game?.slug === 'string' ? game.config.game.slug.trim() : '';
  const tag = normalizedTag(game);
  const slug = rawSlug || configSlug || (tag === 'draft' ? 'default' : '');

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
  const api_active = typeof game.api_active === 'boolean' ? game.api_active : tag === 'published';

  return {
    id: game.id ?? null,
    slug,
    title: game.title ?? config?.game?.title ?? (slug || 'Untitled'),
    channel: tag,
    tag,
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

function deriveGameValue(game) {
  if (!game) return '';
  if (game.slug === 'default') return 'default::draft';
  const channel = normalizedTag(game) === 'published' ? 'published' : 'draft';
  if (game.id != null) return `id:${game.id}::${channel}`;
  if (game.slug) {
    return `slug:${game.slug}::${channel}`;
  }
  return '';
}

function ensureDefaultOption(list) {
  const hasDefault = list.some((entry) => entry.slug === 'default' || entry.value === 'default::draft');
  if (hasDefault) return list;
  const defaultGame = {
    id: null,
    slug: 'default',
    title: 'Default Game',
    channel: 'draft',
    tag: 'draft',
    api_active: false,
    source: 'virtual',
  };
  const defaultOption = {
    value: 'default::draft',
    label: 'Default Game (draft)',
    slug: 'default',
    channel: 'draft',
    tag: 'draft',
    title: 'Default Game',
    game: defaultGame,
  };
  return [defaultOption, ...list];
}

// visible status pill
function StatusPill({ channel }) {
  const isPub = channel === 'published';
  const style = {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    background: isPub ? '#e6ffed' : '#eef2ff',
    color: isPub ? '#036d19' : '#3730a3',
    border: `1px solid ${isPub ? '#9ae6b4' : '#c7d2fe'}`
  };
  return <span style={style}>{isPub ? 'published' : 'draft'}</span>;
}

// --- data hook ---------------------------------------------------------------
export function useGames() {
  const [games, setGames] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);

    let loaded = [];
    let supabaseError = null;

    try {
      if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        const { data, error } = await supabase
          .from('games')
          .select(`
            id, slug, title, tag, channel, api_active, updated_at, published_at,
            default_channel, game_enabled, cover_image, appearance_skin, appearance_tone,
            settings, config, appearance, theme, map
          `)
          .in('channel', ['draft', 'published'])
          .order('updated_at', { ascending: false });
        if (error) supabaseError = error.message || 'Failed to load Supabase games';
        else if (Array.isArray(data)) loaded = data.map(normalizeGame).filter(Boolean);
      } else {
        supabaseError = 'Supabase environment variables missing';
      }
    } catch (error) {
      supabaseError = error?.message || 'Failed to load Supabase games';
    }

    let fallbackError = null;
    if (!loaded.length) {
      try {
        const res = await fetch('/api/games/list', { credentials: 'include', cache: 'no-store' });
        const body = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(body?.games)) {
          loaded = body.games.map((game) => normalizeGame({
            ...game,
            id: game.id ?? null,
            tag: game.channel,
            cover_image: game.coverImage ?? game.cover_image,
            api_active: game.channel === 'published',
            source: 'filesystem',
          })).filter(Boolean);
        } else {
          fallbackError = body?.error || 'No games discovered on filesystem';
        }
      } catch (error) {
        fallbackError = error?.message || 'Failed to load filesystem games';
      }
    }

    const combined = loaded.map(normalizeGame).filter(Boolean);
    setGames(combined);
    const errorMessage = combined.length ? null : fallbackError || supabaseError;
    setErr(errorMessage);
    setBusy(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { games, busy, error: err, reload: load };
}

// --- unified picker ----------------------------------------------------------
export function UnifiedGameSelector({ currentGameId, onSelect }) {
  const { games, busy, error, reload } = useGames();

  const options = useMemo(() => {
    const seen = new Set();
    const base = games.map((g) => {
      const channel = normalizedTag(g);
      const value = deriveGameValue(g);
      const slug = g.slug || (channel === 'draft' ? 'default' : '');
      const label = `${g.title ?? slug ?? 'Untitled'}${channel === 'published' ? ' (published)' : ' (draft)'}`;
      const dedupeKey = `${slug}::${channel}`;
      if (seen.has(dedupeKey) && !(value || '').startsWith('id:')) return null;
      seen.add(dedupeKey);
      return {
        value: value || dedupeKey,
        label,
        slug,
        channel,
        tag: channel,
        id: g.id ?? null,
        game: { ...g, slug, channel, tag: channel },
      };
    }).filter(Boolean);
    return ensureDefaultOption(base);
  }, [games]);

  const handleChange = (value) => {
    const match = options.find((opt) => opt.value === value);
    if (match) {
      onSelect?.(match.value, match.game ?? null);
    } else {
      onSelect?.(value || null, null);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <label style={{ fontWeight: 600, fontSize: 14 }}>Saved Games</label>
      <select
        aria-label="Saved Games"
        disabled={busy}
        value={currentGameId || ''}
        onChange={(e) => handleChange(e.target.value || '')}
        style={{
          padding: '8px 10px',
          borderRadius: 10,
          border: '1px solid #d1d5db',
          minWidth: 260
        }}
      >
        <option value="" disabled>{busy ? 'Loading…' : 'Choose a game'}</option>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => reload()}
        style={{
          padding: '8px 10px',
          borderRadius: 10,
          border: '1px solid #d1d5db',
          background: '#f3f4f6'
        }}
        title="Reload list"
      >
        ↻
      </button>
      {error && <div style={{ color: '#b91c1c', fontSize: 12 }}>Error: {error}</div>}
    </div>
  );
}

// --- mode toggling (Draft vs Live/API) --------------------------------------
// When Draft Mode is ON: api_active = false, channel = 'draft'
// When Make Live: api_active = true, channel = 'published', published_at = now()
async function setDraftMode(gameId) {
  // ⬇️ If your column names differ, change them here
  return supabase.from('games')
    .update({ api_active: false, channel: 'draft', tag: 'draft', published_at: null })
    .eq('id', gameId);
}

async function setLiveMode(gameId, publishedAt = new Date().toISOString()) {
  // ⬇️ If your column names differ, change them here
  return supabase.from('games')
    .update({ api_active: true, channel: 'published', tag: 'published', published_at: publishedAt })
    .eq('id', gameId);
}

// --- Firm Publish button -----------------------------------------------------
export function FirmPublishButton({ game, onAfter }) {
  const [busy, setBusy] = useState(false);

  if (!game || !game.id) return null;

  const alreadyPublished = game.channel === 'published';

  const confirmAndPublish = async () => {
    if (alreadyPublished) return;
    const ok = window.confirm(
      `Firm Publish “${game.title}”?\n\nThis will go LIVE (channel=published) and enable APIs for players.\nYou can revert to Draft Mode later if needed.`
    );
    if (!ok) return;
    setBusy(true);
    const publishedAt = new Date().toISOString();
    const { error } = await setLiveMode(game.id, publishedAt);
    setBusy(false);
    if (error) alert(`Publish failed: ${error.message}`);
    else {
      const nextGame = {
        ...game,
        channel: 'published',
        tag: 'published',
        api_active: true,
        published_at: publishedAt,
      };
      onAfter?.('published', nextGame);
      alert(`“${game.title}” is now LIVE (published).`);
    }
  };

  return (
    <button
      type="button"
      disabled={busy || alreadyPublished}
      onClick={confirmAndPublish}
      style={{
        padding: '10px 14px',
        borderRadius: 12,
        border: '1px solid #0ea5e9',
        background: alreadyPublished ? '#e5e7eb' : '#ecfeff',
        color: alreadyPublished ? '#6b7280' : '#0369a1',
        fontWeight: 700
      }}
      title={alreadyPublished ? 'Already published' : 'Publish and go live'}
    >
      {alreadyPublished ? 'Published' : `Firm Publish “${game.title}”`}
    </button>
  );
}

// --- Draft Mode switch + status row -----------------------------------------
export function ModeRow({ game, onAfter }) {
  if (!game || !game.id) return null;

  const switchDraft = async () => {
    const { error } = await setDraftMode(game.id);
    if (error) alert(`Failed to switch to Draft Mode: ${error.message}`);
    else {
      const nextGame = {
        ...game,
        channel: 'draft',
        tag: 'draft',
        api_active: false,
        published_at: null,
      };
      onAfter?.('draft', nextGame);
      alert(`“${game.title}” is now in Draft Mode (APIs disabled).`);
    }
  };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '140px 1fr auto',
      gap: 10,
      alignItems: 'center',
      padding: '10px 0',
      borderTop: '1px solid #e5e7eb'
    }}>
      <div style={{ fontWeight: 600 }}>Status</div>
      <div>
        <StatusPill channel={game.channel} />{' '}
        <span style={{ color: '#6b7280', fontSize: 12 }}>
          APIs: {game.api_active ? 'enabled' : 'disabled'}
        </span>
      </div>
      {game.channel === 'published' ? (
        <button
          type="button"
          onClick={switchDraft}
          style={{
            padding: '8px 10px',
            borderRadius: 10,
            border: '1px solid #eab308',
            background: '#fffbeb',
            color: '#854d0e',
            fontWeight: 600
          }}
        >
          Set to Draft Mode (disable APIs)
        </button>
      ) : null}
    </div>
  );
}

// --- Close & Save Settings (replaces Back) ----------------------------------
export function CloseAndSaveSettings({ onSave }) {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    setBusy(true);
    try {
      await onSave?.();
      // notify parent UI to close settings (replace with your handler if needed)
      window.dispatchEvent(new CustomEvent('settings:close'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      style={{
        padding: '10px 14px',
        borderRadius: 12,
        border: '1px solid #93c5fd',
        background: '#dbeafe',             // light blue
        color: '#1e40af',
        fontWeight: 800,
        minWidth: 220
      }}
      title="Save all settings and close"
    >
      {busy ? 'Saving…' : 'Close & Save Settings'}
    </button>
  );
}

// --- High-level panel (optional) --------------------------------------------
// Use this inside your Settings window to show the picker + actions together.
export default function GameStatusPanel({
  currentGameId,
  onChangeGame,
  onSaveSettings,
  onStatusChange,
  showCloseButton = true,
}) {
  const { games, reload } = useGames();
  const current = useMemo(() => {
    if (!currentGameId) return null;
    if (currentGameId === 'default::draft') {
      return {
        id: null,
        slug: 'default',
        title: 'Default Game',
        channel: 'draft',
        tag: 'draft',
        api_active: false,
      };
    }
    if (currentGameId.startsWith('id:')) {
      const payload = currentGameId.slice(3);
      const [idValue, channelRaw] = payload.split('::');
      const channel = channelRaw === 'published' ? 'published' : 'draft';
      return (
        games.find((g) => String(g.id ?? '') === idValue && normalizedTag(g) === channel)
        || games.find((g) => String(g.id ?? '') === idValue)
        || null
      );
    }
    if (currentGameId.startsWith('slug:')) {
      const payload = currentGameId.slice(5);
      const [slugValueRaw, channelRaw] = payload.split('::');
      const slugValue = slugValueRaw || '';
      const channel = channelRaw === 'published' ? 'published' : 'draft';
      return (
        games.find((g) => (g.slug || '') === slugValue && normalizedTag(g) === channel)
        || games.find((g) => (g.slug || '') === slugValue)
        || null
      );
    }
    const [slugCandidate, channelCandidate] = String(currentGameId || '').split('::');
    if (slugCandidate) {
      const channel = channelCandidate === 'published' ? 'published' : 'draft';
      return (
        games.find((g) => (g.slug || '') === slugCandidate && normalizedTag(g) === channel)
        || games.find((g) => (g.slug || '') === slugCandidate)
        || null
      );
    }
    return null;
  }, [games, currentGameId]);

  const handleStatus = useCallback(async (nextChannel, game) => {
    await reload();
    onStatusChange?.(nextChannel, game || current);
  }, [reload, onStatusChange, current]);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {/* Unified single dropdown */}
      <UnifiedGameSelector
        currentGameId={currentGameId}
        onSelect={(value, game) => onChangeGame?.(value, game)}
      />

      {/* Mode/Status row */}
      <ModeRow
        game={current}
        onAfter={handleStatus}
      />

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <FirmPublishButton
          game={current}
          onAfter={handleStatus}
        />
        <div style={{ flex: 1 }} />
        {showCloseButton ? (
          <CloseAndSaveSettings onSave={onSaveSettings} />
        ) : null}
      </div>
    </div>
  );
}
