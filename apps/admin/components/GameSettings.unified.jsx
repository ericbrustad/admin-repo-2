"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';

const STORAGE_KEY = 'ESX_GAMES_V2';

// --- Utilities --------------------------------------------------------------

function nowISO() { return new Date().toISOString(); }

function safeParse(json, fallback) {
  try { return JSON.parse(json); } catch { return fallback; }
}

function slugify(title) {
  const s = String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return s || 'untitled';
}

function hasWindow() { return typeof window !== 'undefined'; }

function ensureUniqueSlug(store, desired, currentSlug) {
  const safeStore = store && typeof store === 'object' ? store : { byId: {} };
  const registry = safeStore.byId || {};
  const base = desired || 'untitled';
  if (base === currentSlug) return currentSlug;

  let slug = base;
  let n = 2;
  while (registry[slug] && slug !== currentSlug) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

function createNewGame(baseStore, baseTitle = 'New Game') {
  const safeStore = baseStore && typeof baseStore === 'object'
    ? { byId: baseStore.byId || {}, order: Array.isArray(baseStore.order) ? baseStore.order : [] }
    : { byId: {}, order: [] };

  const normalizedTitle = (baseTitle || '').trim() || 'Untitled';
  const desiredSlug = slugify(normalizedTitle);
  const slug = ensureUniqueSlug(safeStore, desiredSlug);
  const timestamp = nowISO();

  const game = {
    id: slug,
    slug,
    title: normalizedTitle,
    status: 'draft',
    cover: { mode: null },
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const byId = { ...safeStore.byId, [slug]: game };
  const order = safeStore.order.includes(slug) ? safeStore.order : [...safeStore.order, slug];

  return {
    store: {
      byId,
      order,
      current: slug,
    },
    game,
  };
}

function readStore() {
  if (!hasWindow()) return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw) return safeParse(raw, null);
  return null;
}

function writeStore(store) {
  if (!hasWindow()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function migrateLegacyIfNeeded() {
  if (!hasWindow()) return;
  const existing = readStore();
  if (existing) return; // already V2

  // Try to pull from a couple of likely old keys, then normalize.
  const legacyCandidates = [
    'ESX_GAMES',               // older single-key
    'ESX_GAMES_DRAFTS',        // split keys (drafts)
    'ESX_GAMES_PUBLISHED',     // split keys (published)
    'esxape.games',            // misc earlier key
  ];

  let collected = [];
  for (const key of legacyCandidates) {
    const v = window.localStorage.getItem(key);
    if (!v) continue;
    const arr = safeParse(v, []);
    if (Array.isArray(arr)) collected = collected.concat(arr);
  }

  // If a split legacy shape existed as objects, do a loose scan:
  if (collected.length === 0) {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i) || '';
      if (/(games?.(draft|publish)|saved.?games)/i.test(k)) {
        const v = safeParse(window.localStorage.getItem(k) || '[]', []);
        if (Array.isArray(v)) collected = collected.concat(v);
      }
    }
  }

  // Normalize to V2
  if (collected.length > 0) {
    const byId = {};
    const order = [];
    for (const g of collected) {
      const title = g.title || g.name || 'Untitled';
      let slug = g.slug || slugify(title);
      // Make unique
      let base = slug, n = 2;
      while (byId[slug]) { slug = `${base}-${n++}`; }
      const status = g.status === 'published' ? 'published' : 'draft';
      const cover = g.cover || { mode: null };
      byId[slug] = {
        id: g.id || slug,
        slug,
        title,
        status,
        cover,
        createdAt: g.createdAt || nowISO(),
        updatedAt: nowISO()
      };
      order.push(slug);
    }
    const store = { byId, order, current: order[0] || null };
    writeStore(store);
  } else {
    // Seed a default if totally empty.
    const seedTitle = 'Starfield Station Break (default)';
    const { store, game } = createNewGame({ byId: {}, order: [] }, seedTitle);
    writeStore(store);
    updateHeaderTitle({ title: game.title, slug: game.slug });
  }
}

function updateHeaderTitle({ title, slug }) {
  if (!hasWindow()) return;
  const el = document.getElementById('topGameTitle')
       || document.querySelector('[data-game-title-header]');
  if (el) el.textContent = title;
  try {
    const ev = new CustomEvent('esx:game-title-changed', { detail: { title, slug }});
    window.dispatchEvent(ev);
  } catch {}
  document.title = `${title} — Admin`;
}

// --- Cover helpers ----------------------------------------------------------

async function fileToDataURL(file) {
  if (!file) return null;
  const reader = new FileReader();
  return await new Promise((resolve, reject) => {
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// --- Component --------------------------------------------------------------

export default function GameSettingsUnified() {
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentSlug, setCurrentSlug] = useState(null);
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('draft'); // kept for label only
  const [coverMode, setCoverMode] = useState('upload'); // 'upload' | 'url'
  const [coverURL, setCoverURL] = useState('');
  const [coverDataURL, setCoverDataURL] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);

  const fileInput = useRef(null);

  // Init + migration
  useEffect(() => {
    migrateLegacyIfNeeded();
    const s = readStore();
    if (s) {
      setStore(s);
      setCurrentSlug(s.current || null);
      if (s.current && s.byId?.[s.current]) {
        hydrateFromGame(s.byId[s.current]);
      }
    } else {
      const { store: seededStore, game } = createNewGame({ byId: {}, order: [] }, 'Starfield Station Break (default)');
      writeStore(seededStore);
      setStore(seededStore);
      setCurrentSlug(seededStore.current);
      hydrateFromGame(game);
    }
    setLoading(false);
  }, []);

  function hydrateFromGame(g) {
    if (!g) return;
    setTitle(g.title || '');
    setStatus(g.status || 'draft');
    const c = g.cover || { mode: null };
    setCoverMode(c.mode || 'upload');
    setCoverURL(c.url || '');
    setCoverDataURL(c.dataURL || '');
    // Sync header
    updateHeaderTitle({ title: g.title || '', slug: g.slug });
  }

  const games = useMemo(() => {
    if (!store) return [];
    return (store.order || []).map(slug => store.byId?.[slug]).filter(Boolean);
  }, [store]);

  function selectGame(slug) {
    if (!store?.byId?.[slug]) return;
    const next = { ...store, current: slug };
    writeStore(next);
    setStore(next);
    setCurrentSlug(slug);
    hydrateFromGame(next.byId[slug]);
  }

  async function handleUploadChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const dataURL = await fileToDataURL(f);
    setCoverDataURL(String(dataURL || ''));
    setCoverMode('upload');
    if (fileInput.current) fileInput.current.value = '';
  }

  function handleNewGame(baseTitle = 'New Game', baseStore = store) {
    const snapshot = baseStore && baseStore.byId
      ? baseStore
      : { byId: {}, order: [] };
    const { store: nextStore, game } = createNewGame(snapshot, baseTitle);
    writeStore(nextStore);
    setStore(nextStore);
    setCurrentSlug(nextStore.current);
    hydrateFromGame(game);
  }

  function handleTitleChange(v) {
    setTitle(v);
    // Live header sync (without saving yet)
    const liveSlug = slugify(v);
    updateHeaderTitle({ title: v, slug: liveSlug });
  }

  function composeGameFromState(old) {
    const base = old || {};
    const g = { ...base };
    g.title = title.trim() || 'Untitled';
    g.slug = base.slug; // may change on save if title changed
    g.status = status === 'published' ? 'published' : 'draft';
    if (coverMode === 'upload') {
      g.cover = { mode: 'upload', dataURL: coverDataURL || '' };
    } else if (coverMode === 'url') {
      g.cover = { mode: 'url', url: coverURL || '' };
    } else {
      g.cover = { mode: null };
    }
    g.updatedAt = nowISO();
    return g;
  }

  async function handleSave() {
    if (!store || !currentSlug) return;
    setSaveBusy(true);
    try {
      const old = store.byId[currentSlug];
      if (!old) return;
      let nextGame = composeGameFromState(old);

      // Auto-update slug if title changed
      const desired = slugify(nextGame.title);
      const newSlug = ensureUniqueSlug(store, desired, old.slug);
      const slugChanged = newSlug !== old.slug;
      if (slugChanged) nextGame.slug = newSlug;

      // Persist
      const byId = { ...store.byId };
      delete byId[old.slug];
      byId[newSlug] = nextGame;

      const order = (store.order || []).map(s => (s === old.slug ? newSlug : s));
      const next = { byId, order, current: newSlug };
      writeStore(next);
      setStore(next);
      setCurrentSlug(newSlug);
      hydrateFromGame(nextGame);

      // Final header sync
      updateHeaderTitle({ title: nextGame.title, slug: newSlug });
    } finally {
      setSaveBusy(false);
    }
  }

  function handleDelete() {
    if (!store || !currentSlug) return;
    const g = store.byId[currentSlug];
    const ok = window.confirm(`Delete "${g?.title || 'this game'}"? This cannot be undone.`);
    if (!ok) return;

    const byId = { ...store.byId };
    delete byId[currentSlug];
    const order = (store.order || []).filter(s => s !== currentSlug);
    if (order.length === 0) {
      const { store: seededStore, game } = createNewGame({ byId: {}, order: [] });
      writeStore(seededStore);
      setStore(seededStore);
      setCurrentSlug(seededStore.current);
      hydrateFromGame(game);
      return;
    }

    const nextSlug = order[0];
    const next = { byId, order, current: nextSlug };
    writeStore(next);
    setStore(next);
    setCurrentSlug(nextSlug);
    hydrateFromGame(byId[nextSlug]);
  }

  // --- Render ---------------------------------------------------------------

  if (loading) return <div>Loading…</div>;

  const current = currentSlug ? store?.byId?.[currentSlug] : null;
  const coverPreview =
    coverMode === 'upload' ? coverDataURL :
    coverMode === 'url' ? coverURL :
    '';

  return (
    <div style={S.wrap}>
      {/* Top action bar (Save + Delete together, as requested) */}
      <div style={S.actionsBar}>
        <button type="button" style={S.primaryBtn} disabled={saveBusy} onClick={handleSave}>
          {saveBusy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" style={S.dangerBtn} onClick={handleDelete}>
          Delete
        </button>
      </div>

      <div style={S.headerRow}>
        <div style={S.fieldBlock}>
          <label style={S.label}>Saved Games</label>
          <div style={{display:'flex', gap:8}}>
            <select
              value={currentSlug || ''}
              onChange={(e) => selectGame(e.target.value)}
              style={S.select}
            >
              {games.map(g => (
                <option key={g.slug} value={g.slug}>
                  {g.title}{g.status === 'published' ? ' (published)' : ' (draft)'}
                </option>
              ))}
            </select>
            <button type="button" style={S.ghostBtn} onClick={() => handleNewGame()}>+ New Game</button>
          </div>
        </div>
      </div>

      {/* Removed: Entire "Project Flags" section (Mirror, Default Channel, Use Settings for Missions/Devices) */}

      <div style={S.card}>
        <div style={S.fieldBlock}>
          <label style={S.label}>Game Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Enter game title"
            style={S.input}
          />
          <div style={S.helpText}>
            Changing the title auto-updates the slug and your page header.
          </div>
        </div>

        <div style={S.splitRow}>
          <div style={{flex:1}}>
            <label style={S.label}>Cover Image</label>

            <div style={S.tabRow}>
              <label style={S.tabItem}>
                <input
                  type="radio"
                  name="coverMode"
                  checked={coverMode === 'upload'}
                  onChange={() => setCoverMode('upload')}
                />
                <span style={{marginLeft:8}}>Upload</span>
              </label>
              <label style={S.tabItem}>
                <input
                  type="radio"
                  name="coverMode"
                  checked={coverMode === 'url'}
                  onChange={() => setCoverMode('url')}
                />
                <span style={{marginLeft:8}}>URL (Media Pool)</span>
              </label>
            </div>

            {coverMode === 'upload' && (
              <div style={{marginTop:8}}>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  onChange={handleUploadChange}
                  style={S.file}
                />
                <div style={S.helpText}>Image is stored locally as a Data URL until you publish.</div>
              </div>
            )}

            {coverMode === 'url' && (
              <div style={{marginTop:8}}>
                <input
                  type="url"
                  value={coverURL}
                  onChange={(e) => setCoverURL(e.target.value)}
                  placeholder="https://… (e.g., your Supabase/media-pool URL)"
                  style={S.input}
                />
              </div>
            )}
          </div>

          <div style={{flex:'0 0 280px', marginLeft:24}}>
            <div style={S.previewBox}>
              {coverPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="Cover preview" src={coverPreview} style={S.previewImg}/>
              ) : (
                <div style={S.previewEmpty}>No cover selected</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* For clarity, show where your unified "directory" (store) lives */}
      <div style={S.footerNote}>
        <strong>Storage:</strong> localStorage <code>{STORAGE_KEY}</code> (unified).  
        {current ? <> Current slug: <code>{current.slug}</code></> : null}
      </div>
    </div>
  );
}

// --- Styles -----------------------------------------------------------------

const S = {
  wrap: { position:'relative', padding:'16px 16px 24px' },
  actionsBar: {
    position:'absolute', top: -2, right: 8, display:'flex', gap:8, alignItems:'center'
  },
  headerRow: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 },
  fieldBlock: { marginBottom:12, minWidth:260 },
  label: { display:'block', fontSize:12, textTransform:'uppercase', letterSpacing:'0.06em', color:'#667' },
  select: { padding:'8px 10px', border:'1px solid #ccd', borderRadius:6, background:'#fff', minWidth:340 },
  input: { width:'100%', padding:'8px 10px', border:'1px solid #ccd', borderRadius:6, background:'#fff' },
  file: { display:'block' },
  helpText: { fontSize:12, color:'#778', marginTop:6 },
  ghostBtn: {
    padding:'8px 10px', background:'#f6f7fb', border:'1px solid #ccd', borderRadius:6, cursor:'pointer'
  },
  primaryBtn: {
    padding:'8px 12px', background:'#2b6cff', color:'#fff', border:'1px solid #1e5ff0', borderRadius:6, cursor:'pointer'
  },
  dangerBtn: {
    padding:'8px 12px', background:'#ff4b4b', color:'#fff', border:'1px solid #ff3030', borderRadius:6, cursor:'pointer'
  },
  card: {
    background:'#fff', border:'1px solid #e5e7ef', borderRadius:10, padding:16, boxShadow:'0 2px 4px rgba(0,0,0,0.03)'
  },
  splitRow: { display:'flex', alignItems:'flex-start', marginTop:8 },
  tabRow: { display:'flex', gap:16, marginTop:4 },
  tabItem: { display:'flex', alignItems:'center', cursor:'pointer' },
  previewBox: {
    width:280, height:160, border:'1px dashed #ccd', borderRadius:10, display:'flex',
    alignItems:'center', justifyContent:'center', overflow:'hidden', background:'#fafbfe'
  },
  previewImg: { width:'100%', height:'100%', objectFit:'cover' },
  previewEmpty: { color:'#99a', fontSize:12 },
  footerNote: { marginTop:12, fontSize:12, color:'#778' },
};
