"use client";

import React from 'react';
import { useRouter } from 'next/router';

// ───────────────────────────────────────────────────────────────────────────────
// Local Storage Keys & Helpers
// ───────────────────────────────────────────────────────────────────────────────
const LS = {
  INDEX: 'esx:games:index',                 // Array<{ slug, title, channel, published, updated_at }>
  GAME_PREFIX: 'esx:game:',                 // Key shape: esx:game:<slug>:<channel>
  DEF_ANY: 'esx:defaults:any',              // defaultGameSlug
  DEF_PUB: 'esx:defaults:pub',              // defaultPublishedGameSlug
  GEO: 'esx:geo:default',                   // { lat, lng }
};

function isBrowser() { return typeof window !== 'undefined'; }
function nowIso() { return new Date().toISOString(); }
function clampNum(x) { const n = Number(x); return Number.isFinite(n) ? n : 0; }
function normalizeSlug(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'untitled';
}
function labelForGame(g) {
  const base = g.title || g.slug;
  const tag = g.channel === 'published' ? ' (published)' : ' (draft)';
  return `${base}${tag}`;
}

// Safe JSON parse/stringify without throwing
function safeParse(json, fallback) {
  try { return JSON.parse(json); } catch { return fallback; }
}
function safeStringify(obj) {
  try { return JSON.stringify(obj); } catch { return ''; }
}

function storageGet(key, fallback) {
  if (!isBrowser()) return fallback;
  try {
    const v = window.localStorage.getItem(key);
    return v == null ? fallback : v;
  } catch { return fallback; }
}
function storageSet(key, value) {
  if (!isBrowser()) return false;
  try { window.localStorage.setItem(key, value); return true; } catch { return false; }
}
function storageRemove(key) {
  if (!isBrowser()) return false;
  try { window.localStorage.removeItem(key); return true; } catch { return false; }
}

// ───────────────────────────────────────────────────────────────────────────────
// Minimal Game Snapshot shape (keeps map + appearance + suite/devices hooks)
// ───────────────────────────────────────────────────────────────────────────────
function defaultAppearance() {
  return {
    theme: 'dark',
    fonts: { base: 'Inter', display: 'Archivo' },
    colors: { primary: '#3b82f6', text: '#e5e7eb', panel: 'rgba(15, 23, 42, 0.9)' },
  };
}

function defaultConfig() {
  return {
    splash: { enabled: true, mode: 'single' },
    game: { title: 'Untitled Game', type: 'Mystery' },
    forms: { players: 1 },
    timer: { durationMinutes: 0, alertMinutes: 10 },
    textRules: [],
    devices: [],
    powerups: [],
    media: { rewardsPool: [], penaltiesPool: [], actionMedia: [] },
    appearance: defaultAppearance(),
    map: { centerLat: 44.9778, centerLng: -93.2650, defaultZoom: 13 },
    geofence: { mode: 'test' },
  };
}

function makeSnapshot(title, slug) {
  const _slug = normalizeSlug(slug || title);
  return {
    meta: { slug: _slug, title: title || _slug, channel: 'draft' },
    data: {
      suite: [], // missions/etc.
      config: defaultConfig(),
    },
  };
}

// Apply global geo (lat/lng) to snapshot center (safe, no deep mutation surprises)
function applyGeoToSnapshot(snapshot, lat, lng) {
  if (!snapshot?.data?.config) return snapshot;
  const LAT = clampNum(lat);
  const LNG = clampNum(lng);
  const next = { ...snapshot, data: { ...snapshot.data, config: { ...snapshot.data.config } } };
  next.data.config.map = { ...(next.data.config.map || {}), centerLat: LAT, centerLng: LNG };
  return next;
}

// ───────────────────────────────────────────────────────────────────────────────
// Server helpers (optional) – all fail gracefully
// ───────────────────────────────────────────────────────────────────────────────
async function safeFetchJSON(url, opts) {
  try {
    const res = await fetch(url, opts);
    if (!res) return null;
    const txt = await res.text();
    try { return JSON.parse(txt); } catch { return txt || null; }
  } catch { return null; }
}

async function fetchGamesIndexFromServer() {
  const payload = await safeFetchJSON('/api/games/list');
  if (payload && payload.ok && Array.isArray(payload.games)) return payload.games;
  return [];
}

async function saveDefaultsToServer(anySlug, pubSlug) {
  const payload = await safeFetchJSON('/api/app-settings', {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ defaultGameSlug: anySlug || null, defaultPublishedGameSlug: pubSlug || null })
  });
  // Accept any truthy response; ignore failures silently
  return !!payload;
}

// ───────────────────────────────────────────────────────────────────────────────
// Local Index & Snapshot storage
// ───────────────────────────────────────────────────────────────────────────────
function readIndex() {
  const raw = storageGet(LS.INDEX, '[]');
  const list = safeParse(raw, []);
  if (!Array.isArray(list)) return [];
  // de-dupe by slug+channel
  const map = new Map();
  for (const g of list) {
    const key = `${g?.slug}::${g?.channel}`;
    if (g?.slug && g?.channel && !map.has(key)) map.set(key, g);
  }
  return Array.from(map.values());
}

function writeIndex(list) {
  storageSet(LS.INDEX, safeStringify(list || []));
}

function gameKey(slug, channel) {
  return `${LS.GAME_PREFIX}${normalizeSlug(slug)}:${channel === 'published' ? 'published' : 'draft'}`;
}

function readSnapshot(slug, channel) {
  const key = gameKey(slug, channel);
  const raw = storageGet(key, '');
  return raw ? safeParse(raw, null) : null;
}

function writeSnapshot(slug, channel, snapshot) {
  const key = gameKey(slug, channel);
  storageSet(key, safeStringify(snapshot));
}

function deleteSnapshot(slug, channel) {
  storageRemove(gameKey(slug, channel));
}

// Ensure at least one default + one sample exist locally
function seedIfEmpty() {
  const list = readIndex();
  if (list.length > 0) return;
  const defSlug = 'default';
  const sampleSlug = 'starfield-station-break';
  const defSnap = makeSnapshot('Default Game', defSlug);
  const sampleSnap = makeSnapshot('Starfield Station Break', sampleSlug);
  writeSnapshot(defSlug, 'draft', defSnap);
  writeSnapshot(sampleSlug, 'draft', sampleSnap);
  writeIndex([
    { slug: defSlug, title: 'Default Game', channel: 'draft', published: false, updated_at: nowIso() },
    { slug: sampleSlug, title: 'Starfield Station Break', channel: 'draft', published: false, updated_at: nowIso() },
  ]);
}

// syncIndex: ensure index has an entry for provided (slug, channel)
function upsertIndexEntry(slug, title, channel) {
  const list = readIndex();
  const key = `${normalizeSlug(slug)}::${channel}`;
  let found = false;
  const next = list.map((g) => {
    const k = `${normalizeSlug(g.slug)}::${g.channel}`;
    if (k === key) { found = true; return { ...g, title, updated_at: nowIso(), published: channel === 'published' }; }
    return g;
  });
  if (!found) next.unshift({ slug: normalizeSlug(slug), title, channel, published: channel === 'published', updated_at: nowIso() });
  writeIndex(next);
}

function removeIndexEntriesForSlug(slug) {
  const list = readIndex();
  const norm = normalizeSlug(slug);
  const next = list.filter((g) => normalizeSlug(g.slug) !== norm);
  writeIndex(next);
}

// ───────────────────────────────────────────────────────────────────────────────
// Components
// ───────────────────────────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <section style={ST.section}>
      {title ? <h2 style={ST.h2}>{title}</h2> : null}
      {children}
    </section>
  );
}

function FieldRow({ label, children }) {
  return (
    <div style={ST.row}>
      <div style={ST.label}>{label}</div>
      <div style={ST.value}>{children}</div>
    </div>
  );
}

function SavedGamesSelect({ items, value, onChange, loading }) {
  return (
    <div>
      <label style={ST.smallLabel}>Saved Games</label>
      <select style={ST.select} value={value} onChange={(e) => onChange?.(e.target.value)}>
        <option value="">{loading ? 'Loading…' : 'Select a game'}</option>
        {items.map((g) => (
          <option key={`${g.slug}::${g.channel}`} value={`${g.slug}::${g.channel}`}>
            {labelForGame(g)}
          </option>
        ))}
      </select>
      <div style={ST.help}>Switch to another saved escape ride. Use "+ New Game" elsewhere to add a title.</div>
    </div>
  );
}

function DefaultsControls({ items }) {
  const [anySlug, setAnySlug] = React.useState('');
  const [pubSlug, setPubSlug] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [note, setNote] = React.useState('');

  React.useEffect(() => {
    // load from local first; server later
    setAnySlug(storageGet(LS.DEF_ANY, ''));
    setPubSlug(storageGet(LS.DEF_PUB, ''));
    (async () => {
      // try server (non-fatal if missing)
      const res = await safeFetchJSON('/api/app-settings');
      if (res && typeof res.defaultGameSlug === 'string') setAnySlug(res.defaultGameSlug);
      if (res && typeof res.defaultPublishedGameSlug === 'string') setPubSlug(res.defaultPublishedGameSlug);
    })();
  }, []);

  async function save() {
    setSaving(true); setNote('');
    storageSet(LS.DEF_ANY, anySlug || '');
    storageSet(LS.DEF_PUB, pubSlug || '');
    await saveDefaultsToServer(anySlug, pubSlug);
    setSaving(false); setNote('Saved. (Server optional)');
  }

  return (
    <div style={ST.defaultsWrap}>
      <div>
        <div style={ST.smallLabel}>Default Game (all)</div>
        <select style={ST.select} value={anySlug || ''} onChange={(e)=>setAnySlug(e.target.value)}>
          <option value="">— none —</option>
          {items.map((g)=> (
            <option key={`any::${g.slug}`} value={g.slug}>{g.title || g.slug}</option>
          ))}
        </select>
      </div>
      <div>
        <div style={ST.smallLabel}>Default Published (only published)</div>
        <select style={ST.select} value={pubSlug || ''} onChange={(e)=>setPubSlug(e.target.value)}>
          <option value="">— none —</option>
          {items.filter(g=>g.channel==='published').map((g)=> (
            <option key={`pub::${g.slug}`} value={g.slug}>{g.title || g.slug}</option>
          ))}
        </select>
      </div>
      <button style={ST.primaryBtn} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Defaults'}</button>
      {note ? <div style={ST.note}>{note}</div> : null}
    </div>
  );
}

function GeoControls({ geo, onChange, onApplyToSnapshot }) {
  const [lat, setLat] = React.useState(String(geo?.lat ?? ''));
  const [lng, setLng] = React.useState(String(geo?.lng ?? ''));
  const [note, setNote] = React.useState('');

  React.useEffect(() => {
    setLat(String(geo?.lat ?? ''));
    setLng(String(geo?.lng ?? ''));
  }, [geo?.lat, geo?.lng]);

  function saveGeo() {
    const obj = { lat: clampNum(lat), lng: clampNum(lng) };
    storageSet(LS.GEO, safeStringify(obj));
    onChange?.(obj);
    setNote('Saved default geo.');
    setTimeout(()=>setNote(''), 1200);
  }

  return (
    <div>
      <FieldRow label="Latitude">
        <input style={ST.input} inputMode="decimal" value={lat} onChange={(e)=>setLat(e.target.value)} />
      </FieldRow>
      <FieldRow label="Longitude">
        <input style={ST.input} inputMode="decimal" value={lng} onChange={(e)=>setLng(e.target.value)} />
      </FieldRow>
      <div style={ST.rowBtns}>
        <button style={ST.primaryBtn} onClick={saveGeo}>Save Default Geo</button>
        <button style={ST.secondaryBtn} onClick={()=>onApplyToSnapshot?.(clampNum(lat), clampNum(lng))}>Apply to Current Game</button>
      </div>
      {note ? <div style={ST.note}>{note}</div> : null}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Main Page
// ───────────────────────────────────────────────────────────────────────────────
export default function SettingsGlobalFinalPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [items, setItems] = React.useState([]); // index
  const [selectVal, setSelectVal] = React.useState('');
  const [snapshot, setSnapshot] = React.useState(null);
  const [status, setStatus] = React.useState('');
  const [geo, setGeo] = React.useState(() => safeParse(storageGet(LS.GEO, ''), null));

  // seed + load index
  React.useEffect(() => {
    if (!isBrowser()) return;
    seedIfEmpty();
    (async () => {
      setLoading(true);
      const serverList = await fetchGamesIndexFromServer(); // non-fatal, may be []
      const localList = readIndex();
      // merge, prefer local recency
      const map = new Map();
      for (const g of [...serverList, ...localList]) {
        if (!g?.slug) continue;
        const k = `${normalizeSlug(g.slug)}::${g.channel || 'draft'}`;
        const prev = map.get(k);
        if (!prev || (g.updated_at && (!prev.updated_at || g.updated_at > prev.updated_at))) map.set(k, g);
      }
      const merged = Array.from(map.values());
      setItems(merged);
      setLoading(false);
    })();
  }, []);

  // when you pick a game from dropdown, load it
  async function handleSelect(val) {
    setSelectVal(val);
    if (!val) return;
    const [slug, channel = 'draft'] = String(val).split('::');
    await openGame(slug, channel);
  }

  async function openGame(slug, channel) {
    const norm = normalizeSlug(slug);
    let snap = readSnapshot(norm, channel) || readSnapshot(norm, 'draft');
    if (!snap) {
      snap = makeSnapshot(norm, norm);
      snap.meta.channel = channel === 'published' ? 'published' : 'draft';
      writeSnapshot(norm, snap.meta.channel, snap);
      upsertIndexEntry(norm, snap.meta.title, snap.meta.channel);
      setItems(readIndex());
    }
    setSnapshot(snap);
    setStatus(`Opened ${norm} (${snap.meta.channel})`);
    // optionally reflect in URL (shallow) to keep state discoverable
    try {
      const query = { ...router.query, game: norm, channel: snap.meta.channel };
      router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
    } catch {}
  }

  function save(channel) {
    if (!snapshot) return;
    const norm = normalizeSlug(snapshot.meta?.slug || 'untitled');
    const title = snapshot.meta?.title || norm;
    const ch = channel === 'published' ? 'published' : 'draft';
    const next = { ...snapshot, meta: { ...snapshot.meta, slug: norm, title, channel: ch } };
    writeSnapshot(norm, ch, next);
    upsertIndexEntry(norm, title, ch);
    setItems(readIndex());
    setSnapshot(next);
    setStatus(`Saved ${norm} (${ch})`);
  }

  function deleteCurrent() {
    if (!snapshot) return;
    const norm = normalizeSlug(snapshot.meta?.slug || '');
    if (!norm) return;
    deleteSnapshot(norm, 'draft');
    deleteSnapshot(norm, 'published');
    removeIndexEntriesForSlug(norm);
    setItems(readIndex());
    setSnapshot(null);
    setSelectVal('');
    setStatus(`Deleted ${norm}`);
  }

  function onTitleChange(v) {
    if (!snapshot) return;
    const t = String(v || '').trim();
    const s = normalizeSlug(t);
    const next = { ...snapshot, meta: { ...snapshot.meta, title: t || s, slug: s } };
    setSnapshot(next);
  }

  function onApplyGeo(lat, lng) {
    if (!snapshot) return;
    const next = applyGeoToSnapshot(snapshot, lat, lng);
    setSnapshot(next);
    setStatus('Applied geo to current game');
  }

  const publishedItems = React.useMemo(() => items.filter(g => g.channel === 'published'), [items]);

  return (
    <div style={ST.page}>
      <h1 style={ST.h1}>Settings</h1>

      <Section title="Saved Games">
        <SavedGamesSelect items={items} value={selectVal} onChange={handleSelect} loading={loading} />
        <div style={ST.rowBtns}>
          <button style={ST.primaryBtn} onClick={()=>save('draft')} disabled={!snapshot}>💾 Save Draft</button>
          <button style={ST.primaryBtn} onClick={()=>save('published')} disabled={!snapshot}>🚀 Save Published</button>
          <button style={ST.dangerBtn} onClick={deleteCurrent} disabled={!snapshot}>🗑 Delete Game</button>
        </div>
      </Section>

      <Section title="Game Meta">
        <FieldRow label="Title">
          <input style={ST.input} value={snapshot?.meta?.title || ''} onChange={(e)=>onTitleChange(e.target.value)} placeholder="Game title" />
        </FieldRow>
        <FieldRow label="Slug">
          <input style={{...ST.input, opacity:0.7}} value={snapshot?.meta?.slug || ''} onChange={(e)=>onTitleChange(e.target.value)} />
        </FieldRow>
        <div style={ST.help}>Changing the title updates the slug automatically.</div>
      </Section>

      <Section title="Global Location (Geo)">
        <GeoControls geo={geo} onChange={setGeo} onApplyToSnapshot={onApplyGeo} />
      </Section>

      <Section title="Default Game Shortcuts">
        <DefaultsControls items={items} />
        {publishedItems.length === 0 && (
          <div style={ST.tip}>Tip: publish one game to enable Default Published selection.</div>
        )}
      </Section>

      <footer style={ST.footer}>
        <RepoSnapshotFooter />
        {status ? <div style={ST.status}>Status: {status}</div> : null}
      </footer>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Footer w/ environment snapshot (no failures if env missing)
// ───────────────────────────────────────────────────────────────────────────────
function readEnv(key) {
  if (typeof process !== 'undefined' && process.env && process.env[key]) return process.env[key];
  if (isBrowser() && window.__ENV__ && window.__ENV__[key]) return window.__ENV__[key];
  return '';
}
function initialMeta() {
  const vercelHost = readEnv('VERCEL_URL');
  const normalizedVercel = vercelHost ? (vercelHost.startsWith('http') ? vercelHost : `https://${vercelHost}`) : '';
  return {
    repo: readEnv('REPO_NAME') || readEnv('VERCEL_GIT_REPO_SLUG') || '',
    branch: readEnv('REPO_BRANCH') || readEnv('VERCEL_GIT_COMMIT_REF') || '',
    commit: readEnv('VERCEL_GIT_COMMIT_SHA') || readEnv('GITHUB_SHA') || '',
    deploymentUrl:
      readEnv('DEPLOYMENT_URL') || readEnv('VERCEL_DEPLOYMENT_URL') || readEnv('VERCEL_PROJECT_PRODUCTION_URL') || readEnv('VERCEL_BRANCH_URL') || normalizedVercel,
    vercelUrl: normalizedVercel,
    deploymentState: readEnv('DEPLOYMENT_STATE') || readEnv('VERCEL_ENV') || '',
    fetchedAt: nowIso(),
  };
}

function RepoSnapshotFooter() {
  const [meta, setMeta] = React.useState(initialMeta());

  React.useEffect(() => {
    let active = true;
    (async () => {
      const payload = await safeFetchJSON('/api/admin-meta');
      if (!active || !payload) return;
      if (payload && payload.ok !== false) {
        setMeta({
          repo: payload.repo || meta.repo,
          branch: payload.branch || meta.branch,
          commit: payload.commit || meta.commit,
          deploymentUrl: payload.deploymentUrl || meta.deploymentUrl,
          vercelUrl: payload.vercelUrl || meta.vercelUrl,
          deploymentState: payload.deploymentState || meta.deploymentState,
          fetchedAt: payload.fetchedAt || nowIso(),
        });
      }
    })();
    return ()=>{ active = false; };
  }, []); // eslint-disable-line

  return (
    <div style={ST.metaWrap}>
      <div><strong>Repository:</strong> {meta.repo || '—'} • <strong>Branch:</strong> {meta.branch || '—'} • <strong>Commit:</strong> {meta.commit || '—'}</div>
      <div>
        <strong>Deployment:</strong>{' '}
        {meta.deploymentUrl ? <a style={ST.link} href={meta.deploymentUrl} target="_blank" rel="noreferrer">{meta.deploymentUrl}</a> : '—'}
        {meta.vercelUrl ? (<>
          {' '}• <strong>Vercel:</strong>{' '}<a style={ST.link} href={meta.vercelUrl} target="_blank" rel="noreferrer">{meta.vercelUrl}</a>
        </>) : null}
        {meta.deploymentState ? ` • ${meta.deploymentState}` : ''}
      </div>
      <div>Snapshot fetched {formatDateTime(meta.fetchedAt)}</div>
    </div>
  );
}

function formatDateTime(value) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch (e) {
    try { return new Date(value).toLocaleString(); } catch { return String(value); }
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Styles (inline, minimal, dark-friendly)
// ───────────────────────────────────────────────────────────────────────────────
const ST = {
  page: { padding: 24, maxWidth: 920, margin: '0 auto', color: 'var(--admin-body-color, #0f172a)' },
  h1: { fontSize: 26, fontWeight: 800, marginBottom: 16 },
  section: { display: 'grid', gap: 12, padding: '16px 16px', borderRadius: 14, border: '1px solid var(--admin-border-soft, #e5e7eb)', background: 'var(--appearance-panel-bg, rgba(255,255,255,0.9))', marginBottom: 18 },
  h2: { fontSize: 16, fontWeight: 700, margin: 0 },
  row: { display: 'grid', gridTemplateColumns: '200px 1fr', alignItems: 'center', gap: 12 },
  label: { fontSize: 13, color: 'var(--admin-muted, #475569)' },
  smallLabel: { fontSize: 12, color: 'var(--admin-muted, #64748b)', marginBottom: 6, display: 'block' },
  value: { display: 'flex', alignItems: 'center', gap: 8 },
  input: { width: '100%', padding: '8px 10px', borderRadius: 10, border: '1px solid var(--admin-border-soft, #e5e7eb)', background: 'transparent' },
  select: { width: '100%', padding: '8px 10px', borderRadius: 10, border: '1px solid var(--admin-border-soft, #e5e7eb)', background: 'transparent' },
  rowBtns: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  primaryBtn: { padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(59,130,246,0.35)', background: 'rgba(59,130,246,0.15)', cursor: 'pointer', fontWeight: 700 },
  secondaryBtn: { padding: '8px 12px', borderRadius: 10, border: '1px solid var(--admin-border-soft,#e5e7eb)', background: 'transparent', cursor: 'pointer', fontWeight: 600 },
  dangerBtn: { padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.6)', background: 'rgba(239,68,68,0.15)', cursor: 'pointer', fontWeight: 700, color: '#991b1b' },
  help: { fontSize: 12, color: 'var(--admin-muted, #64748b)' },
  tip: { fontSize: 12, color: 'var(--admin-muted, #64748b)', opacity: 0.9 },
  note: { fontSize: 12, color: 'var(--admin-muted, #64748b)' },
  metaWrap: { borderTop: '1px solid var(--admin-border-soft,#e5e7eb)', paddingTop: 10, marginTop: 6, fontSize: 12, color: 'var(--admin-muted,#475569)' },
  link: { color: 'var(--admin-link-color, #3b82f6)', textDecoration: 'underline' },
  footer: { marginTop: 12 },
  status: { marginTop: 8, fontSize: 12, color: 'var(--admin-muted, #475569)' },
};
