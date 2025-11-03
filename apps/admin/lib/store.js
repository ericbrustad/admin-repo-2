// apps/admin/lib/store.js
// One canonical local store for Admin drafts.
// Stores games, tags, and cover images together.
// Auto-migrates from v1 ("esxape:drafts:v1") to v2 ("esxape:games:v2").
// No Supabase writes until "Firm Publish".

const V2_KEY = 'esxape:games:v2';
const V1_KEY = 'esxape:drafts:v1';

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return '';
  }
}

function parse(json, fallback) {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

function readRaw(key) {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(key);
  return raw ? parse(raw, null) : null;
}

function writeRaw(key, obj) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(obj));
}

// ---------- Slug / Tag helpers ----------
export function slugify(title) {
  return String(title || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function ensureUniqueSlug(wanted) {
  const store = getStore();
  const base = wanted || 'untitled';
  if (base === 'default' && !store.games.some((g) => g.slug === 'default')) return 'default';
  if (base === 'default') {
    let i = 2;
    let cand = `untitled-${i++}`;
    while (store.games.some((g) => g.slug === cand)) cand = `untitled-${i++}`;
    return cand;
  }
  let candidate = base;
  let i = 2;
  while (store.games.some((g) => g.slug === candidate)) candidate = `${base}-${i++}`;
  return candidate;
}

// ---------- Core store ----------
function normalizeV2(obj) {
  const games = Array.isArray(obj?.games) ? obj.games : [];
  const bySlug = new Map();
  for (const game of games) {
    if (!game?.slug) continue;
    const prev = bySlug.get(game.slug);
    if (!prev || String(prev.updatedAt || '') < String(game.updatedAt || '')) {
      bySlug.set(game.slug, game);
    }
  }
  const arr = Array.from(bySlug.values());
  const tags = arr.map((g) => g.slug);
  return { version: 2, games: arr, tags, updatedAt: nowIso() };
}

function migrateV1toV2() {
  const v1 = readRaw(V1_KEY);
  if (!v1 || !Array.isArray(v1.drafts)) return null;
  const seen = new Set();
  const allocateSlug = (candidate) => {
    let base = candidate || 'untitled';
    if (base === 'default' && !seen.has('default')) {
      seen.add('default');
      return 'default';
    }
    if (base === 'default') base = 'untitled';
    let slug = base;
    let i = 2;
    while (seen.has(slug)) {
      slug = `${base}-${i++}`;
    }
    seen.add(slug);
    return slug;
  };

  const games = v1.drafts.map((draft) => {
    const title = draft.title || 'Untitled';
    const wantedSlug = draft.slug || slugify(title) || 'untitled';
    return {
      id: draft.id || `draft-${Math.random().toString(36).slice(2)}`,
      title,
      slug: allocateSlug(wantedSlug),
      channel: draft.channel === 'published' ? 'published' : 'draft',
      payload:
        draft.payload || {
          settings: {},
          missions: [],
          devices: [],
          powerups: [],
          media: [],
        },
      coverImage: draft.coverImage || null,
      updatedAt: draft.updatedAt || nowIso(),
    };
  });
  const v2 = normalizeV2({ games });
  writeRaw(V2_KEY, v2);
  return v2;
}

function getStore() {
  const v2 = readRaw(V2_KEY);
  if (v2) return normalizeV2(v2);
  const migrated = migrateV1toV2();
  if (migrated) return migrated;
  const fresh = normalizeV2({ games: [] });
  writeRaw(V2_KEY, fresh);
  return fresh;
}

function setStore(next) {
  const normalized = normalizeV2(next);
  writeRaw(V2_KEY, normalized);
  return normalized;
}

function saveGameRecord(rec) {
  const store = getStore();
  const idx = store.games.findIndex((g) => g.slug === rec.slug);
  if (idx >= 0) store.games[idx] = rec;
  else store.games.push(rec);
  return setStore(store);
}

// ---------- Public API ----------
export function listGames() {
  const { games } = getStore();
  return [...games].sort((a, b) => {
    if (a.slug === 'default') return -1;
    if (b.slug === 'default') return 1;
    return (b.updatedAt || '').localeCompare(a.updatedAt || '');
  });
}

export function listTags() {
  const { tags } = getStore();
  return [...tags];
}

export function getGame(slug) {
  return getStore().games.find((g) => g.slug === slug) || null;
}

function safeRandomId() {
  try {
    const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
    if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  } catch {
    // ignore
  }
  return Math.random().toString(36).slice(2);
}

export function upsertGame(partial) {
  const rec = {
    id: partial.id || `draft-${safeRandomId()}`,
    title: partial.title || 'Untitled',
    slug: partial.slug || ensureUniqueSlug(slugify(partial.title) || 'untitled'),
    channel: partial.channel === 'published' ? 'published' : 'draft',
    payload:
      partial.payload || {
        settings: {},
        missions: [],
        devices: [],
        powerups: [],
        media: [],
      },
    coverImage: partial.coverImage ?? null,
    updatedAt: nowIso(),
  };
  const next = saveGameRecord(rec);
  return next.games.find((g) => g.slug === rec.slug) || rec;
}

export function deleteGame(slug) {
  if (slug === 'default') return getStore();
  const store = getStore();
  const after = store.games.filter((g) => g.slug !== slug);
  return setStore({ ...store, games: after });
}

export function ensureDefaultGame() {
  const store = getStore();
  if (!store.games.some((g) => g.slug === 'default')) {
    setStore({
      ...store,
      games: [
        ...store.games,
        {
          id: 'draft-default',
          title: 'Default',
          slug: 'default',
          channel: 'draft',
          payload: { settings: {}, missions: [], devices: [], powerups: [], media: [] },
          coverImage: null,
          updatedAt: nowIso(),
        },
      ],
    });
  }
  return getGame('default');
}

// ---------- Cover image helpers (dataURL persisted) ----------
export async function setCoverFromFile(slug, file, { maxDim = 1400 } = {}) {
  const game = getGame(slug);
  if (!game || !file) return game;
  const dataUrl = await fileToResizedDataURL(file, maxDim);
  const meta = await getImageMeta(dataUrl);
  return upsertGame({
    ...game,
    coverImage: {
      dataUrl,
      mime: meta.mime,
      width: meta.width,
      height: meta.height,
      updatedAt: nowIso(),
    },
  });
}

export function clearCover(slug) {
  const game = getGame(slug);
  if (!game) return null;
  return upsertGame({ ...game, coverImage: null });
}

function fileToResizedDataURL(file, maxDim) {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('File APIs unavailable'));
      return;
    }
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('File read error'));
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const { canvas, ctx, w, h } = makeCanvasFor(img, maxDim);
        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const outType = /png|webp|jpeg|jpg/i.test(file.type) ? file.type : 'image/jpeg';
        resolve(canvas.toDataURL(outType, 0.9));
      };
      img.onerror = () => reject(new Error('Image load error'));
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

function makeCanvasFor(img, maxDim) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const ratio = img.width / img.height;
  let w;
  let h;
  if (img.width >= img.height) {
    w = Math.min(img.width, maxDim);
    h = Math.round(w / ratio);
  } else {
    h = Math.min(img.height, maxDim);
    w = Math.round(h * ratio);
  }
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx, w, h };
}

function getImageMeta(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const match = /^data:(.*?);base64,/.exec(dataUrl);
      resolve({ width: img.width, height: img.height, mime: match ? match[1] : 'image/jpeg' });
    };
    img.src = dataUrl;
  });
}

export function getStoreSnapshot() {
  return getStore();
}

export const STORAGE_KEY = V2_KEY;
