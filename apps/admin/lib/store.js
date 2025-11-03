// apps/admin/lib/store.js
// One canonical local store for Admin drafts.
// Stores games, tags, and cover images together.
// Auto-migrates from v1 ("esxape:drafts:v1") to v2 ("esxape:games:v2").
// Seeds from generated game catalog (public/game-data) to keep legacy metadata available.
// No Supabase writes until "Firm Publish".

import { GAME_CATALOG, GAME_METADATA } from './game-data.generated.js';

const V2_KEY = 'esxape:games:v2';
const V1_KEY = 'esxape:drafts:v1';

const DEFAULT_METADATA = Object.freeze({
  description: '',
  tags: [],
  category: '',
  difficulty: '',
  durationMins: null,
  center: { lat: null, lng: null },
});

const DEFAULT_PAYLOAD = Object.freeze({
  settings: {},
  missions: [],
  devices: [],
  powerups: [],
  media: [],
});

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
function isFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num);
}

function normalizeTags(tags) {
  if (!tags) return [];
  const set = new Set();
  if (Array.isArray(tags)) {
    for (const tag of tags) {
      if (typeof tag !== 'string') continue;
      const next = tag.trim();
      if (next) set.add(next);
    }
  } else if (typeof tags === 'string') {
    for (const chunk of tags.split(',')) {
      const next = chunk.trim();
      if (next) set.add(next);
    }
  }
  return Array.from(set);
}

function stripUndefined(obj) {
  if (!obj || typeof obj !== 'object') return {};
  const next = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) next[key] = value;
  }
  return next;
}

function normalizeMetadata(meta) {
  const base = { ...DEFAULT_METADATA };
  const source = meta && typeof meta === 'object' ? meta : {};
  const centerSource = source.center && typeof source.center === 'object' ? source.center : {};
  const next = {
    description: typeof source.description === 'string' ? source.description : base.description,
    tags: normalizeTags(source.tags),
    category: typeof source.category === 'string' ? source.category : base.category,
    difficulty: typeof source.difficulty === 'string' ? source.difficulty : base.difficulty,
    durationMins: isFiniteNumber(source.durationMins) ? Number(source.durationMins) : base.durationMins,
    center: {
      lat: isFiniteNumber(centerSource.lat) ? Number(centerSource.lat) : base.center.lat,
      lng: isFiniteNumber(centerSource.lng) ? Number(centerSource.lng) : base.center.lng,
    },
  };
  return next;
}

function mergeMetadata(existing, patch) {
  const safeExisting = normalizeMetadata(existing);
  const source = patch && typeof patch === 'object' ? patch : {};
  const sanitizedSource = stripUndefined(source);
  const centerPatch = stripUndefined(source.center);
  delete sanitizedSource.center;
  const next = {
    ...safeExisting,
    ...sanitizedSource,
    center: {
      ...safeExisting.center,
      ...centerPatch,
    },
  };
  return normalizeMetadata(next);
}

function normalizeGame(game) {
  if (!game || typeof game !== 'object') return null;
  const payloadSource = game.payload && typeof game.payload === 'object' ? game.payload : {};
  const payload = { ...DEFAULT_PAYLOAD, ...payloadSource };
  const normalized = {
    id: game.id || `draft-${safeRandomId()}`,
    title: game.title || 'Untitled',
    slug: game.slug || slugify(game.title || 'Untitled') || 'untitled',
    channel: game.channel === 'published' ? 'published' : 'draft',
    payload: {
      ...payload,
      meta: normalizeMetadata(payloadSource.meta),
    },
    coverImage: game.coverImage ?? null,
    updatedAt: game.updatedAt || nowIso(),
  };
  return normalized;
}

function normalizeV2(obj) {
  const games = Array.isArray(obj?.games) ? obj.games : [];
  const bySlug = new Map();
  for (const game of games) {
    if (!game?.slug) continue;
    const prev = bySlug.get(game.slug);
    if (!prev || String(prev.updatedAt || '') < String(game.updatedAt || '')) {
      const normalized = normalizeGame(game);
      if (normalized) bySlug.set(game.slug, normalized);
    }
  }
  const arr = Array.from(bySlug.values());
  const tagSet = new Set();
  for (const entry of arr) {
    for (const tag of entry?.payload?.meta?.tags || []) {
      if (typeof tag === 'string' && tag.trim()) tagSet.add(tag.trim());
    }
  }
  const tags = Array.from(tagSet).sort((a, b) => a.localeCompare(b));
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
      payload: {
        ...DEFAULT_PAYLOAD,
        ...(draft.payload && typeof draft.payload === 'object' ? draft.payload : {}),
      },
      coverImage: draft.coverImage || null,
      updatedAt: draft.updatedAt || nowIso(),
    };
  });
  const v2 = normalizeV2({ games });
  writeRaw(V2_KEY, v2);
  return v2;
}

function applyGeneratedCatalog(store) {
  if (!Array.isArray(GAME_CATALOG) || GAME_CATALOG.length === 0) return store;
  const seen = new Set(store.games.map((g) => g.slug));
  let changed = false;

  for (const entry of GAME_CATALOG) {
    const slug = typeof entry?.slug === 'string' ? entry.slug.trim() : '';
    if (!slug || seen.has(slug)) continue;

    const metadata = GAME_METADATA?.[slug] || {};
    const summary = metadata.summary || {};
    const canonical = metadata.sources?.canonicalGame || {};
    const description =
      (typeof summary.description === 'string' && summary.description) ||
      (typeof canonical.longDescription === 'string' && canonical.longDescription) ||
      (typeof entry.shortDescription === 'string' ? entry.shortDescription : '') ||
      '';
    const tagsSource =
      (Array.isArray(summary.tags) && summary.tags.length ? summary.tags : null) ||
      (Array.isArray(canonical.tags) && canonical.tags.length ? canonical.tags : null) ||
      null;
    const category =
      (typeof canonical.type === 'string' && canonical.type) ||
      (typeof entry.type === 'string' && entry.type) ||
      '';

    const generated = normalizeGame({
      title: typeof entry.title === 'string' && entry.title.trim() ? entry.title : slug,
      slug,
      channel: normalizeChannelStrict(entry.channel),
      payload: {
        ...DEFAULT_PAYLOAD,
        meta: {
          ...DEFAULT_METADATA,
          description,
          tags: tagsSource ? normalizeTags(tagsSource) : [],
          category: category || DEFAULT_METADATA.category,
        },
      },
      updatedAt: metadata.updatedAt || entry.updatedAt || nowIso(),
    });

    if (generated) {
      store.games.push(generated);
      seen.add(slug);
      changed = true;
    }
  }

  if (!changed) return store;
  return setStore(store);
}

function getStore() {
  const v2 = readRaw(V2_KEY);
  if (v2) return applyGeneratedCatalog(normalizeV2(v2));
  const migrated = migrateV1toV2();
  if (migrated) return applyGeneratedCatalog(migrated);
  const fresh = normalizeV2({ games: [] });
  writeRaw(V2_KEY, fresh);
  return applyGeneratedCatalog(fresh);
}

function setStore(next) {
  const normalized = normalizeV2(next);
  writeRaw(V2_KEY, normalized);
  return normalized;
}

function saveGameRecord(rec) {
  const normalized = normalizeGame(rec);
  if (!normalized) return getStore();
  const store = getStore();
  const idx = store.games.findIndex((g) => g.slug === normalized.slug);
  if (idx >= 0) store.games[idx] = normalized;
  else store.games.push(normalized);
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
  const slug =
    partial.slug || ensureUniqueSlug(slugify(partial.title) || 'untitled');
  const existing = getGame(slug);
  const rec = normalizeGame({
    ...existing,
    ...partial,
    id: partial.id || existing?.id || `draft-${safeRandomId()}`,
    slug,
    title: partial.title ?? existing?.title ?? 'Untitled',
    channel: partial.channel ?? existing?.channel ?? 'draft',
    updatedAt: nowIso(),
  });
  if (!rec) return existing || null;
  const next = saveGameRecord(rec);
  return next.games.find((g) => g.slug === rec.slug) || rec;
}

export function updateMetadata(slug, patch) {
  if (!slug) return null;
  const store = getStore();
  const idx = store.games.findIndex((g) => g.slug === slug);
  if (idx < 0) return null;
  const existing = store.games[idx];
  const nextMeta = mergeMetadata(existing?.payload?.meta, patch);
  const rec = normalizeGame({
    ...existing,
    payload: {
      ...existing.payload,
      meta: nextMeta,
    },
    updatedAt: nowIso(),
  });
  if (!rec) return existing || null;
  store.games[idx] = rec;
  const nextStore = setStore(store);
  return nextStore.games.find((g) => g.slug === slug) || rec;
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
    saveGameRecord({
      id: 'draft-default',
      title: 'Default',
      slug: 'default',
      channel: 'draft',
      payload: { ...DEFAULT_PAYLOAD, meta: DEFAULT_METADATA },
      coverImage: null,
      updatedAt: nowIso(),
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
