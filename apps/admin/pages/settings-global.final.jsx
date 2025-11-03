import React from 'react';

// ──────────────────────────────────────────────────────────────────────────────
// Utilities (browser-only)
// ──────────────────────────────────────────────────────────────────────────────
const LS = {
  INDEX: 'esx:games:index',                 // Array<{ slug, title, channel, published, updated_at }>
  GAME_PREFIX: 'esx:game:',                 // Key: esx:game:<slug>:<channel>
  DEF_ANY: 'esx:defaults:any',              // defaultGameSlug (local)
  DEF_PUB: 'esx:defaults:pub',              // defaultPublishedGameSlug (local)
  GEO: 'esx:geo:default',                   // { lat, lng }
};

function isBrowser() { return typeof window !== 'undefined'; }
function nowIso() { return new Date().toISOString(); }
function clampNum(x) { const n = Number(x); return Number.isFinite(n) ? n : 0; }
export function normalizeSlug(s) {
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
export function safeParse(json, fallback) {
  try { return JSON.parse(json); } catch { return fallback; }
}
function safeStringify(obj) {
  try { return JSON.stringify(obj); } catch { return ''; }
}
function storageGet(key, fallback) {
  if (!isBrowser()) return fallback;
  try { const v = window.localStorage.getItem(key); return v == null ? fallback : v; } catch { return fallback; }
}
function storageSet(key, value) {
  if (!isBrowser()) return false;
  try { window.localStorage.setItem(key, value); return true; } catch { return false; }
}
function storageRemove(key) {
  if (!isBrowser()) return false;
  try { window.localStorage.removeItem(key); return true; } catch { return false; }
}

// ──────────────────────────────────────────────────────────────────────────────
// Snapshot helpers
// ──────────────────────────────────────────────────────────────────────────────
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
export function makeSnapshot(title, slug) {
  const _slug = normalizeSlug(slug || title);
  return {
    meta: { slug: _slug, title: title || _slug, channel: 'draft' },
    data: { suite: [], config: defaultConfig() },
  };
}
export function applyGeoToSnapshot(snapshot, lat, lng) {
  if (!snapshot?.data?.config) return snapshot;
  const LAT = clampNum(lat);
  const LNG = clampNum(lng);
  const next = { ...snapshot, data: { ...snapshot.data, config: { ...snapshot.data.config } } };
  next.data.config.map = { ...(next.data.config.map || {}), centerLat: LAT, centerLng: LNG };
  return next;
}

// ──────────────────────────────────────────────────────────────────────────────
// Local index + snapshot storage
// ──────────────────────────────────────────────────────────────────────────────
function readIndex() {
  const raw = storageGet(LS.INDEX, '[]');
  const list = safeParse(raw, []);
  if (!Array.isArray(list)) return [];
  const map = new Map();
  for (const g of list) {
    const key = `${g?.slug}::${g?.channel}`;
    if (g?.slug && g?.channel && !map.has(key)) map.set(key, g);
  }
  return Array.from(map.values());
}
function writeIndex(list) { storageSet(LS.INDEX, safeStringify(list || [])); }
function gameKey(slug, channel) { return `${LS.GAME_PREFIX}${normalizeSlug(slug)}:${channel === 'published' ? 'published' : 'draft'}`; }
function readSnapshot(slug, channel) { const raw = storageGet(gameKey(slug, channel), ''); return raw ? safeParse(raw, null) : null; }
function writeSnapshot(slug, channel, snapshot) { storageSet(gameKey(slug, channel), safeStringify(snapshot)); }
function deleteSnapshot(slug, channel) { storageRemove(gameKey(slug, channel)); }

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
  const norm = normalizeSlug(slug);
  writeIndex(readIndex().filter((g) => normalizeSlug(g.slug) !== norm));
}

// ──────────────────────────────────────────────────────────────────────────────
// UI bits
// ──────────────────────────────────────────────────────────────────────────────
function Section({ title, children }) { return (<section style={ST.section}>{title ? <h2 style={ST.h2}>{title}</h2> : null}{children}</section>); }
function FieldRow({ labelText, children }) { return (<div style={ST.row}><div style={ST.label}>{labelText}</div><div style={ST.value}>{children}</div></div>); }
function SavedGamesSelect({ items, value, onChange, loading }) {
  return (
    <div>
      <label style={ST.smallLabel}>Saved Games</label>
      <select style={ST.select} value={value} onChange={(e)=>onChange?.(e.target.value)}>
        <option value="">{loading ? 'Loading…' : 'Select a game'}</option>
        {items.map((g) => (
          <option key={`${g.slug}::${g.channel}`} value={`${g.slug}::${g.channel}`}>{labelForGame(g)}</option>
        ))}
      </select>
      <div style={ST.help}>Switch to another saved escape ride. Use "+ New Game" elsewhere to add a title.</div>
    </div>
  );
}
function DefaultsControls({ items }) {
  const [anySlug, setAnySlug] = React.useState(() => storageGet(LS.DEF_ANY, ''));
  const [pubSlug, setPubSlug] = React.useState(() => storageGet(LS.DEF_PUB, ''));
  const [saving, setSaving] = React.useState(false);
  const [note, setNote] = React.useState('');
  function save() {
    setSaving(true); setNote('');
    storageSet(LS.DEF_ANY, anySlug || '');
    storageSet(LS.DEF_PUB, pubSlug || '');
    setTimeout(()=>{ setSaving(false); setNote('Saved defaults (local).'); }, 200);
  }
  const publishedOnly = items.filter(it => it.channel === 'published');
  return (
    <div style={ST.defaultsWrap}>
      <div>
        <div style={ST.smallLabel}>Default Game (all)</div>
        <select style={ST.select} value={anySlug || ''} onChange={(e)=>setAnySlug(e.target.value)}>
          <option value="">— none —</option>
          {items.map((g)=> (<option key={`any::${g.slug}`} value={g.slug}>{g.title || g.slug}</option>))}
        </select>
      </div>
      <div>
        <div style={ST.smallLabel}>Default Published (only published)</div>
        <select style={ST.select} value={pubSlug || ''} onChange={(e)=>setPubSlug(e.target.value)}>
          <option value="">— none —</option>
          {publishedOnly.map((g)=> (<option key={`pub::${g.slug}`} value={g.slug}>{g.title || g.slug}</option>))}
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
  React.useEffect(() => { setLat(String(geo?.lat ?? '')); setLng(String(geo?.lng ?? '')); }, [geo?.lat, geo?.lng]);
  function saveGeo() { const obj = { lat: clampNum(lat), lng: clampNum(lng) }; storageSet(LS.GEO, safeStringify(obj)); onChange?.(obj); setNote('Saved default geo.'); setTimeout(()=>setNote(''), 1200); }
  return (
    <div>
      <FieldRow labelText="Latitude"><input style={ST.input} inputMode="decimal" value={lat} onChange={(e)=>setLat(e.target.value)} /></FieldRow>
      <FieldRow labelText="Longitude"><input style={ST.input} inputMode="decimal" value={lng} onChange={(e)=>setLng(e.target.value)} /></FieldRow>
      <div style={ST.rowBtns}>
        <button style={ST.primaryBtn} onClick={saveGeo}>Save Default Geo</button>
        <button style={ST.secondaryBtn} onClick={()=>onApplyToSnapshot?.(clampNum(lat), clampNum(lng))}>Apply to Current Game</button>
      </div>
      {note ? <div style={ST.note}>{note}</div> : null}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Self-test panel (basic, browser runtime). These are NOT unit tests in Jest,
// but they validate core helpers at runtime without any server.
// ──────────────────────────────────────────────────────────────────────────────
function SelfTestPanel() {
  const [results, setResults] = React.useState([]);
  React.useEffect(() => {
    const out = [];
    function t(name, fn) { try { const r = fn(); out.push({ name, ok: r === true, detail: r }); } catch (e) { out.push({ name, ok: false, detail: String(e) }); } }

    // Test cases (ADD-ON as requested)
    t('normalizeSlug trims & kebab-cases', () => normalizeSlug('  Hello  World!  ') === 'hello-world');
    t('normalizeSlug collapses underscores', () => normalizeSlug('A__B__C') === 'a-b-c');
    t('safeParse valid JSON', () => { const v = safeParse('{"a":1}', null); return v && v.a === 1; });
    t('safeParse fallback on invalid JSON', () => safeParse('nope', 42) === 42);
    t('makeSnapshot assigns defaults', () => { const s = makeSnapshot('Demo', 'Demo'); return s?.meta?.slug === 'demo' && s?.data?.config?.map?.centerLat === 44.9778; });
    t('applyGeoToSnapshot updates map center', () => { const s = makeSnapshot('X','x'); const n = applyGeoToSnapshot(s, 1.23, 4.56); return n.data.config.map.centerLat === 1.23 && n.data.config.map.centerLng === 4.56; });
    t('localStorage roundtrip', () => { storageSet('__t__','x'); const v = storageGet('__t__',''); storageRemove('__t__'); return v === 'x'; });

    setResults(out);
  }, []);
  return (
    <Section title="Self Tests">
      <ul style={ST.testList}>
        {results.map((r, i) => (<li key={i} style={{ color: r.ok ? '#16a34a' : '#b91c1c' }}>{r.ok ? '✓' : '✗'} {r.name}{!r.ok && r.detail ? ` — ${r.detail}` : ''}</li>))}
      </ul>
    </Section>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Deployment + repo snapshot (browser safe, optional fetch)
// ──────────────────────────────────────────────────────────────────────────────
function readEnv(key) {
  if (typeof process !== 'undefined' && process?.env?.[key]) return process.env[key];
  if (isBrowser() && window.__ENV__ && window.__ENV__[key]) return window.__ENV__[key];
  return '';
}
function normalizeUrlCandidate(value) {
  if (!value) return '';
  const str = String(value).trim();
  if (!str) return '';
  return /^https?:/i.test(str) ? str : `https://${str.replace(/^\/+/, '')}`;
}
function formatLocalDateTime(value) {
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '—';
  }
}
function initialDevMeta() {
  const repoOwner = readEnv('NEXT_PUBLIC_REPO_OWNER')
    || readEnv('REPO_OWNER')
    || readEnv('VERCEL_GIT_REPO_OWNER')
    || '';
  const repoName = readEnv('NEXT_PUBLIC_REPO_NAME')
    || readEnv('REPO_NAME')
    || readEnv('VERCEL_GIT_REPO_SLUG')
    || '';
  const branch = readEnv('NEXT_PUBLIC_REPO_BRANCH')
    || readEnv('REPO_BRANCH')
    || readEnv('VERCEL_GIT_COMMIT_REF')
    || readEnv('GITHUB_BRANCH')
    || '';
  const commit = readEnv('NEXT_PUBLIC_COMMIT_SHA')
    || readEnv('VERCEL_GIT_COMMIT_SHA')
    || readEnv('GITHUB_SHA')
    || '';
  const deploymentHost = readEnv('NEXT_PUBLIC_DEPLOYMENT_URL')
    || readEnv('DEPLOYMENT_URL')
    || readEnv('VERCEL_DEPLOYMENT_URL')
    || readEnv('VERCEL_PROJECT_PRODUCTION_URL')
    || readEnv('VERCEL_BRANCH_URL')
    || readEnv('NEXT_PUBLIC_VERCEL_URL')
    || readEnv('VERCEL_URL')
    || '';
  const vercelHost = readEnv('NEXT_PUBLIC_VERCEL_URL') || readEnv('VERCEL_URL') || '';
  return {
    owner: repoOwner,
    repo: repoName,
    branch,
    commit,
    deploymentUrl: normalizeUrlCandidate(deploymentHost),
    vercelUrl: normalizeUrlCandidate(vercelHost),
    fetchedAt: '',
    error: '',
  };
}
function DevDeploymentInfo() {
  const [meta, setMeta] = React.useState(() => initialDevMeta());

  React.useEffect(() => {
    if (!isBrowser()) return undefined;
    let cancelled = false;

    async function loadMeta() {
      try {
        const response = await fetch('/api/admin-meta', { cache: 'no-store', credentials: 'include' });
        if (!response?.ok) throw new Error('Failed to fetch admin meta');
        const payload = await response.json().catch(() => null);
        if (cancelled || !payload) return;
        if (payload.ok === false) {
          setMeta((prev) => ({ ...prev, fetchedAt: nowIso(), error: payload.error || 'Unable to load deployment metadata' }));
          return;
        }
        setMeta((prev) => ({
          owner: payload.owner || prev.owner || '',
          repo: payload.repo || prev.repo || '',
          branch: payload.branch || prev.branch || '',
          commit: payload.commit || prev.commit || '',
          deploymentUrl: normalizeUrlCandidate(payload.deploymentUrl || prev.deploymentUrl || prev.vercelUrl),
          vercelUrl: normalizeUrlCandidate(payload.vercelUrl || prev.vercelUrl || ''),
          fetchedAt: payload.fetchedAt || nowIso(),
          error: '',
        }));
      } catch (err) {
        if (cancelled) return;
        setMeta((prev) => ({ ...prev, fetchedAt: nowIso(), error: 'Unable to fetch deployment metadata' }));
      }
    }

    loadMeta();
    const timer = window.setInterval(loadMeta, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const repoLabel = meta.owner && meta.repo ? `${meta.owner}/${meta.repo}` : (meta.repo || '—');
  const repoUrl = meta.owner && meta.repo ? `https://github.com/${meta.owner}/${meta.repo}` : '';
  const branchLabel = meta.branch || '—';
  const commitFull = meta.commit || '';
  const commitShort = commitFull ? commitFull.slice(0, 7) : '—';
  const commitUrl = repoUrl && commitFull ? `${repoUrl}/commit/${commitFull}` : '';
  const deploymentUrl = meta.deploymentUrl || meta.vercelUrl || '';
  const deploymentLabel = deploymentUrl ? deploymentUrl.replace(/^https?:\/\//, '') : '—';
  const fetchedLabel = meta.fetchedAt ? formatLocalDateTime(meta.fetchedAt) : '—';
  const renderedLabel = formatLocalDateTime(new Date());
  const hasError = Boolean(meta.error);

  return (
    <footer style={ST.devInfoWrap}>
      <div style={ST.devInfoHeading}>Dev Deployment Snapshot</div>
      <div style={ST.devInfoRow}>
        <span style={ST.devInfoItem}>
          <strong>Repo:</strong>{' '}
          {repoUrl ? <a href={repoUrl} target="_blank" rel="noreferrer" style={ST.devInfoLink}>{repoLabel}</a> : repoLabel}
        </span>
        <span style={ST.devInfoSeparator}>•</span>
        <span style={ST.devInfoItem}><strong>Branch:</strong> {branchLabel}</span>
        <span style={ST.devInfoSeparator}>•</span>
        <span style={ST.devInfoItem}>
          <strong>Commit:</strong>{' '}
          {commitUrl && commitShort !== '—'
            ? <a href={commitUrl} target="_blank" rel="noreferrer" style={ST.devInfoLink}>{commitShort}</a>
            : commitShort}
        </span>
        <span style={ST.devInfoSeparator}>•</span>
        <span style={ST.devInfoItem}>
          <strong>Deployment:</strong>{' '}
          {deploymentUrl ? (
            <a href={deploymentUrl} target="_blank" rel="noreferrer" style={ST.devInfoLink}>{deploymentLabel}</a>
          ) : (
            deploymentLabel
          )}
        </span>
      </div>
      <div style={ST.devInfoMeta}>
        Snapshot fetched {fetchedLabel} • Rendered {renderedLabel}
      </div>
      {hasError ? <div style={ST.devInfoError}>{meta.error}</div> : null}
    </footer>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Main Page (no Next.js router; no server fetch)
// ──────────────────────────────────────────────────────────────────────────────
export default function SettingsGlobalFinalPage() {
  const [loading, setLoading] = React.useState(true);
  const [items, setItems] = React.useState([]);
  const [selectVal, setSelectVal] = React.useState('');
  const [snapshot, setSnapshot] = React.useState(null);
  const [status, setStatus] = React.useState('');
  const [geo, setGeo] = React.useState(() => safeParse(storageGet(LS.GEO, ''), null));

  React.useEffect(() => {
    if (!isBrowser()) return;
    seedIfEmpty();
    setItems(readIndex());
    setLoading(false);
  }, []);

  function handleSelect(val) {
    setSelectVal(val);
    if (!val) return;
    const [slug, channel = 'draft'] = String(val).split('::');
    openGame(slug, channel);
  }
  function openGame(slug, channel) {
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
    setSnapshot({ ...snapshot, meta: { ...snapshot.meta, title: t || s, slug: s } });
  }
  function onApplyGeo(lat, lng) {
    if (!snapshot) return;
    setSnapshot(applyGeoToSnapshot(snapshot, lat, lng));
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
        <FieldRow labelText="Title"><input style={ST.input} value={snapshot?.meta?.title || ''} onChange={(e)=>onTitleChange(e.target.value)} placeholder="Game title" /></FieldRow>
        <FieldRow labelText="Slug"><input style={{...ST.input, opacity:0.7}} value={snapshot?.meta?.slug || ''} onChange={(e)=>onTitleChange(e.target.value)} /></FieldRow>
        <div style={ST.help}>Changing the title updates the slug automatically.</div>
      </Section>

      <Section title="Global Location (Geo)">
        <GeoControls geo={geo} onChange={setGeo} onApplyToSnapshot={onApplyGeo} />
      </Section>

      <Section title="Default Game Shortcuts">
        <DefaultsControls items={items} />
        {publishedItems.length === 0 && (<div style={ST.tip}>Tip: publish one game to enable Default Published selection.</div>)}
      </Section>

      <SelfTestPanel />

      {status ? <div style={ST.status}>Status: {status}</div> : null}

      <DevDeploymentInfo />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Styles (inline, minimal)
// ──────────────────────────────────────────────────────────────────────────────
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
  defaultsWrap: { display: 'grid', gap: 12, alignItems: 'start', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' },
  note: { fontSize: 12, color: 'var(--admin-muted, #64748b)' },
  status: { marginTop: 8, fontSize: 12, color: 'var(--admin-muted, #475569)' },
  testList: { margin: 0, paddingLeft: 18, fontSize: 13 },
  devInfoWrap: { marginTop: 18, padding: '16px 18px', borderRadius: 14, border: '1px solid var(--admin-border-soft, #e5e7eb)', background: 'var(--appearance-panel-bg, rgba(255,255,255,0.9))', display: 'grid', gap: 6 },
  devInfoHeading: { fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--admin-muted, #64748b)' },
  devInfoRow: { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  devInfoItem: { fontSize: 13, color: 'var(--admin-body-color, #0f172a)' },
  devInfoSeparator: { fontSize: 12, color: 'var(--admin-muted, #64748b)' },
  devInfoLink: { color: 'var(--admin-link-color, #2563eb)', textDecoration: 'none', fontWeight: 600 },
  devInfoMeta: { fontSize: 12, color: 'var(--admin-muted, #475569)' },
  devInfoError: { fontSize: 12, color: '#b91c1c', fontWeight: 600 },
};
