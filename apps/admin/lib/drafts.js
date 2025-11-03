// apps/admin/lib/drafts.js
// Lightweight local draft store (browser-only). No Supabase writes until "Firm Publish".

const STORAGE_KEY = 'esxape:drafts:v1';

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return '';
  }
}

function safeParse(json, fallback) {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

function getStore() {
  if (typeof window === 'undefined') return { drafts: [] };
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const data = safeParse(raw, { drafts: [] });
  if (!Array.isArray(data.drafts)) data.drafts = [];
  return data;
}

function setStore(data) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function slugify(title) {
  return String(title || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function listDrafts() {
  const drafts = Array.isArray(getStore().drafts) ? [...getStore().drafts] : [];
  return drafts.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export function getDraftBySlug(slug) {
  const drafts = getStore().drafts;
  return drafts.find((d) => d.slug === slug) || null;
}

export function upsertDraft(draft) {
  const store = getStore();
  const next = { ...draft, channel: draft.channel === 'published' ? 'published' : 'draft', updatedAt: nowIso() };
  if (!next.payload || typeof next.payload !== 'object') {
    next.payload = {
      settings: {},
      missions: [],
      devices: [],
      powerups: [],
      media: [],
    };
  }
  const idx = store.drafts.findIndex((d) => d.slug === next.slug);
  if (idx >= 0) store.drafts[idx] = next;
  else store.drafts.push(next);
  setStore(store);
  return next;
}

export function deleteDraft(slug) {
  const store = getStore();
  store.drafts = store.drafts.filter((d) => d.slug !== slug);
  setStore(store);
}

export function ensureUniqueSlug(wantedSlug, ignoreSlug) {
  const drafts = listDrafts();
  const base = wantedSlug || 'untitled';
  let candidate = base;
  let i = 2;
  const skip = ignoreSlug ? String(ignoreSlug) : null;
  while (drafts.some((d) => d.slug === candidate && (!skip || d.slug !== skip))) {
    candidate = `${base}-${i++}`;
  }
  return candidate;
}

export function makeNewDraft(title = 'Untitled Game') {
  const baseSlug = slugify(title) || 'untitled';
  const slug = ensureUniqueSlug(baseSlug);
  const blank = {
    id: `draft-${typeof crypto !== 'undefined' && crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`,
    title,
    slug,
    channel: 'draft',
    payload: {
      settings: {},
      missions: [],
      devices: [],
      powerups: [],
      media: [],
    },
    updatedAt: nowIso(),
  };
  return upsertDraft(blank);
}
