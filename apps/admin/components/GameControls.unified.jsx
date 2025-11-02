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
function normalizeGame(game) {
  if (!game) return null;
  const channel = game.channel === 'published' ? 'published' : 'draft';
  const slug = game.slug || (channel === 'draft' ? 'default' : '');
  return { ...game, channel, slug };
}

function ensureDefaultOption(list) {
  const hasDefault = list.some((entry) => entry.value === 'default::draft');
  if (hasDefault) return list;
  return [
    {
      value: 'default::draft',
      label: 'Default Game (draft)',
      slug: 'default',
      channel: 'draft',
      title: 'Default Game',
      game: {
        id: null,
        slug: 'default',
        channel: 'draft',
        title: 'Default Game',
        api_active: false,
      },
    },
    ...list,
  ];
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
    const { data, error } = await supabase
      .from('games')
      .select('id, slug, title, channel, api_active, updated_at, published_at')
      .order('updated_at', { ascending: false });
    if (error) setErr(error.message);
    else setGames(Array.isArray(data) ? data.map(normalizeGame) : []);
    setBusy(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { games, busy, error: err, reload: load };
}

// --- unified picker ----------------------------------------------------------
export function UnifiedGameSelector({ currentGameId, onSelect }) {
  const { games, busy, error, reload } = useGames();

  const options = useMemo(() => {
    const base = games.map((g) => ({
      value: String(g.id),
      label: `${g.title ?? 'Untitled'}${g.channel === 'published' ? ' (published)' : ' (draft)'}`,
      slug: g.slug,
      channel: g.channel,
      id: g.id,
      game: g,
    }));
    return ensureDefaultOption(base.map((entry) => ({ ...entry, game: entry.game ?? null })));
  }, [games]);

  const handleChange = (value) => {
    const match = options.find((opt) => opt.value === value);
    if (match) {
      onSelect?.(match.value, match.game ?? {
        id: match.id ?? null,
        slug: match.slug,
        channel: match.channel,
        title: match.label,
      });
      return;
    }
    if (value === 'default::draft') {
      onSelect?.('default::draft', {
        id: null,
        slug: 'default',
        channel: 'draft',
        title: 'Default Game',
        api_active: false,
      });
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
    .update({ api_active: false, channel: 'draft' })
    .eq('id', gameId);
}

async function setLiveMode(gameId) {
  // ⬇️ If your column names differ, change them here
  return supabase.from('games')
    .update({ api_active: true, channel: 'published', published_at: new Date().toISOString() })
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
    const { error } = await setLiveMode(game.id);
    setBusy(false);
    if (error) alert(`Publish failed: ${error.message}`);
    else {
      onAfter?.('published', game);
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
      onAfter?.('draft', game);
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
        api_active: false,
      };
    }
    return games.find((g) => String(g.id) === String(currentGameId)) || null;
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
