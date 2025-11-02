// CODEx PATCH — Split Draft vs Published Behavior
// File: apps/admin/components/CodexDrop.GameDraftsPanel.jsx
// Behavior:
//  - Draft Mode → LocalStorage only
//  - Published Mode → Full Supabase CRUD
//  - Unified title/slug sync for all games
//  - Delete works in both modes

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const LS_PREFIX = 'erix:admin:drafts';
const STARFIELD_DEFAULT = 'Starfield Station Break';

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'untitled';
}

function draftKey(game) {
  const id = game?.id ? `id:${game.id}` : `slug:${game?.slug || 'default'}`;
  return `${LS_PREFIX}:${id}`;
}

function setPageTitle(name) {
  if (typeof document !== 'undefined') document.title = `${name || 'Admin'} — Admin`;
}

// --- local draft helpers ---
function loadLocalDraft(game) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(draftKey(game));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function saveLocalDraft(game, payload) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(draftKey(game), JSON.stringify(payload));
  } catch {}
}
function deleteLocalDraft(game) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(draftKey(game));
  } catch {}
}

// --- Component ---
export default function CodexDropGameDraftsPanel({
  value,
  onChange,
  onCloseAndSave,
  mode = 'draft', // "draft" or "published" determined by Admin Settings
}) {
  const [games, setGames] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [current, setCurrent] = useState(null);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [channel, setChannel] = useState('draft');

  const isDraftMode = mode === 'draft';

  // --- load from Supabase or Local ---
  const reload = useCallback(async () => {
    setBusy(true);
    setError(null);
    if (isDraftMode) {
      // local only
      if (typeof window === 'undefined') {
        setGames([]);
        setBusy(false);
        return;
      }
      const storage = window.localStorage;
      const localGames = Object.keys(storage)
        .filter((k) => k.startsWith(LS_PREFIX))
        .map((key) => {
          try {
            const data = JSON.parse(storage.getItem(key));
            const localSlug = typeof data?.slug === 'string' ? data.slug : 'draft-game';
            const localTitle = typeof data?.title === 'string' ? data.title : STARFIELD_DEFAULT;
            const localChannel = data?.channel === 'published' ? 'published' : 'draft';
            return {
              id: null,
              slug: localSlug,
              title: localTitle,
              channel: localChannel,
              tag: localChannel,
              api_active: false,
              source: 'local',
            };
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      setGames(localGames);
      setBusy(false);
      return;
    }
    // Supabase
    try {
      const { data, error } = await supabase
        .from('games')
        .select('id, slug, title, channel, tag, api_active, updated_at, published_at')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      const mapped = (data || []).map((entry) => {
        const channel = entry?.channel === 'published' || entry?.tag === 'published' ? 'published' : 'draft';
        const slug = typeof entry?.slug === 'string' && entry.slug.trim().length
          ? entry.slug.trim()
          : channel === 'draft'
            ? 'default'
            : '';
        const title = typeof entry?.title === 'string' && entry.title.trim().length
          ? entry.title.trim()
          : slug || STARFIELD_DEFAULT;
        return {
          id: entry?.id ?? null,
          slug,
          title,
          channel,
          tag: channel,
          api_active: typeof entry?.api_active === 'boolean' ? entry.api_active : channel === 'published',
          updated_at: entry?.updated_at ?? null,
          published_at: entry?.published_at ?? null,
          source: 'supabase',
        };
      });
      setGames(mapped);
    } catch (fetchError) {
      setError(fetchError?.message || 'Failed to load games');
      setGames([]);
    }
    setBusy(false);
  }, [isDraftMode]);

  useEffect(() => { reload(); }, [reload]);

  // --- when selection changes ---
  useEffect(() => {
    const found = games.find((g) => String(g.id) === String(value) || g.slug === value);
    setCurrent(found || null);
    if (found) {
      const draft = loadLocalDraft(found);
      setTitle(draft?.title || found.title);
      setSlug(draft?.slug || found.slug);
      setChannel(found.channel || 'draft');
      setPageTitle(draft?.title || found.title);
    }
  }, [value, games]);

  // --- Save ---
  const handleSave = async () => {
    if (!current) return;
    if (isDraftMode) {
      saveLocalDraft(current, { title, slug, channel });
      alert('Saved locally (Draft Mode).');
      return;
    }
    const { error } = await supabase
      .from('games')
      .update({ title, slug })
      .eq('id', current.id);
    if (error) alert(`Failed to save: ${error.message}`);
    else alert('Saved to Supabase (Live Mode).');
  };

  // --- Publish ---
  const handlePublish = async () => {
    if (!current) return;
    const ok = confirm(`Publish “${title}”?`);
    if (!ok) return;
    if (isDraftMode) {
      saveLocalDraft(current, { title, slug, channel: 'published' });
      alert('Locally marked as Published (Draft Mode).');
      return;
    }
    const { error } = await supabase
      .from('games')
      .update({ title, slug, channel: 'published', api_active: true })
      .eq('id', current.id);
    if (error) alert(`Publish failed: ${error.message}`);
    else alert(`Published “${title}”.`);
    reload();
  };

  // --- Delete ---
  const handleDelete = async () => {
    if (!current) return;
    const ok = confirm(`Delete “${current.title}”? This cannot be undone.`);
    if (!ok) return;
    if (isDraftMode) {
      deleteLocalDraft(current);
      alert('Deleted locally (Draft Mode).');
      reload();
      return;
    }
    const { error } = await supabase.from('games').delete().eq('id', current.id);
    if (error) alert(`Delete failed: ${error.message}`);
    else {
      alert('Deleted from Supabase (Live Mode).');
      reload();
    }
  };

  // --- UI ---
  const options = useMemo(() => {
    return games.map((g) => ({
      value: g.id ? String(g.id) : g.slug,
      label: `${g.title} (${g.channel})`,
    }));
  }, [games]);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label style={{ fontWeight: 700 }}>Saved Games</label>
        <select
          disabled={busy}
          value={(current?.id != null ? String(current.id) : '') || current?.slug || ''}
          onChange={(e) => {
            const raw = e.target.value;
            const next = games.find((g) => {
              if (g.id != null && String(g.id) === raw) return true;
              return g.slug === raw;
            }) || null;
            onChange?.(raw, next);
          }}
          style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid #d1d5db', minWidth: 260 }}
        >
          <option value="" disabled>{busy ? 'Loading…' : 'Select a game'}</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button onClick={reload} style={{ padding: '8px 10px', border: '1px solid #d1d5db' }}>↻</button>
        {error ? <div style={{ color: '#b91c1c', fontSize: 12, marginLeft: 8 }}>Error: {error}</div> : null}
      </div>

      {current ? (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, background: '#fff' }}>
          <div style={{ marginBottom: 6 }}><strong>Game Title</strong></div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 8 }}
          />
          <div style={{ marginTop: 8, fontSize: 12, color: '#555' }}>
            <strong>Slug:</strong> {slug || '(auto)'}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={() => setSlug(slugify(title))} style={{ padding: '8px 12px' }}>Auto Slugify</button>
            <button onClick={handleSave} style={{ padding: '8px 12px', background: '#dcfce7', border: '1px solid #16a34a' }}>Save</button>
            <button onClick={handlePublish} style={{ padding: '8px 12px', background: '#e0f2fe', border: '1px solid #0ea5e9' }}>Publish</button>
            <button onClick={handleDelete} style={{ padding: '8px 12px', background: '#fee2e2', border: '1px solid #ef4444', color: '#991b1b' }}>Delete</button>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
            Mode: <strong>{isDraftMode ? 'Draft (Local)' : 'Published (Supabase)'}</strong>
          </div>
        </div>
      ) : (
        <div style={{ color: '#6b7280', fontSize: 13 }}>Select a game to edit or delete.</div>
      )}
    </div>
  );
}

export function CloseAndSaveSettings({ onSave }) {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
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

export function useCodexGames(mode = 'published') {
  const [games, setGames] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setBusy(true);
    setError(null);
    if (mode === 'draft') {
      if (typeof window === 'undefined') {
        setGames([]);
        setBusy(false);
        return;
      }
      try {
        const storage = window.localStorage;
        const localGames = Object.keys(storage)
          .filter((key) => key.startsWith(LS_PREFIX))
          .map((key) => {
            try {
              const data = JSON.parse(storage.getItem(key));
              const slug = typeof data?.slug === 'string' ? data.slug : 'draft-game';
              const title = typeof data?.title === 'string' ? data.title : STARFIELD_DEFAULT;
              const channel = data?.channel === 'published' ? 'published' : 'draft';
              return {
                id: null,
                slug,
                title,
                channel,
                tag: channel,
                api_active: channel === 'published',
                source: 'local',
              };
            } catch {
              return null;
            }
          })
          .filter(Boolean);
        setGames(localGames);
      } catch (storageError) {
        setError(storageError?.message || 'Failed to read local drafts');
        setGames([]);
      }
      setBusy(false);
      return;
    }

    try {
      const { data, error: fetchError } = await supabase
        .from('games')
        .select('id, slug, title, channel, tag, api_active, updated_at, published_at')
        .order('updated_at', { ascending: false });
      if (fetchError) throw fetchError;
      const mapped = (data || []).map((entry) => {
        const channel = entry?.channel === 'published' || entry?.tag === 'published' ? 'published' : 'draft';
        const slug = typeof entry?.slug === 'string' && entry.slug.trim().length
          ? entry.slug.trim()
          : channel === 'draft'
            ? 'default'
            : '';
        const title = typeof entry?.title === 'string' && entry.title.trim().length
          ? entry.title.trim()
          : slug || STARFIELD_DEFAULT;
        return {
          id: entry?.id ?? null,
          slug,
          title,
          channel,
          tag: channel,
          api_active: typeof entry?.api_active === 'boolean' ? entry.api_active : channel === 'published',
          updated_at: entry?.updated_at ?? null,
          published_at: entry?.published_at ?? null,
          source: 'supabase',
        };
      });
      setGames(mapped);
    } catch (fetchError) {
      setError(fetchError?.message || 'Failed to load games');
      setGames([]);
    }
    setBusy(false);
  }, [mode]);

  useEffect(() => { reload(); }, [reload]);

  return { games, busy, error, reload };
}
