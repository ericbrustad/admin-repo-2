// apps/admin/lib/drafts.js
// Local-only draft store (no Supabase until publish).
// Stores cover image as a (resized) data URL so it recalls reliably.

const STORAGE_KEY = 'esxape:drafts:v1';

function nowIso() {
  try { return new Date().toISOString(); } catch { return ''; }
}
function safeParse(json, fallback) {
  try { return JSON.parse(json); } catch { return fallback; }
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

// --- Slug helpers -----------------------------------------------------------
export function slugify(title) {
  return String(title || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
export function ensureUniqueSlug(wantedSlug) {
  const drafts = listDrafts();
  const base = wantedSlug || 'untitled';
  // "default" is reserved for the Default game
  if (base === 'default' && !drafts.some(d => d.slug === 'default')) return 'default';
  if (base === 'default') {
    // If default exists, fall back to untitled-2 …
    let c = 2;
    let cand = `untitled-${c++}`;
    while (drafts.some(d => d.slug === cand)) cand = `untitled-${c++}`;
    return cand;
  }
  let candidate = base;
  let i = 2;
  while (drafts.some(d => d.slug === candidate)) {
    candidate = `${base}-${i++}`;
  }
  return candidate;
}

// --- CRUD -------------------------------------------------------------------
export function listDrafts() {
  // De-dupe by slug (prefer latest updatedAt)
  const all = getStore().drafts;
  const map = new Map();
  for (const d of all) {
    const have = map.get(d.slug);
    if (!have || String(have?.updatedAt || '') < String(d.updatedAt || '')) {
      map.set(d.slug, d);
    }
  }
  const arr = Array.from(map.values());
  // Sort with "default" on top, then newest first
  arr.sort((a, b) => {
    if (a.slug === 'default') return -1;
    if (b.slug === 'default') return 1;
    return (b.updatedAt || '').localeCompare(a.updatedAt || '');
  });
  return arr;
}

export function getDraftBySlug(slug) {
  return listDrafts().find(d => d.slug === slug) || null;
}

export function upsertDraft(draft) {
  const store = getStore();
  const next = {
    ...draft,
    channel: draft.channel === 'published' ? 'published' : 'draft',
    updatedAt: nowIso(),
  };
  const idx = store.drafts.findIndex(d => d.slug === next.slug);
  if (idx >= 0) store.drafts[idx] = next;
  else store.drafts.push(next);
  setStore(store);
  return next;
}

export function deleteDraft(slug) {
  if (slug === 'default') return; // safeguard: never delete Default
  const store = getStore();
  store.drafts = store.drafts.filter(d => d.slug !== slug);
  setStore(store);
}

export function ensureDefaultDraft() {
  const store = getStore();
  if (!store.drafts.some(d => d.slug === 'default')) {
    const blank = {
      id: 'draft-default',
      title: 'Default',
      slug: 'default',
      channel: 'draft',
      payload: { settings: {}, missions: [], devices: [], powerups: [], media: [] },
      coverImage: null, // { dataUrl, mime, width, height, updatedAt }
      updatedAt: nowIso(),
    };
    store.drafts.push(blank);
    setStore(store);
  }
  return getDraftBySlug('default');
}

export function makeNewDraft(title = 'New Game') {
  // Create a non-default draft, saved immediately.
  const baseSlug = slugify(title) || 'untitled';
  const slug = ensureUniqueSlug(baseSlug);
  const blank = {
    id: `draft-${crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
    title,
    slug,
    channel: 'draft',
    payload: { settings: {}, missions: [], devices: [], powerups: [], media: [] },
    coverImage: null,
    updatedAt: nowIso(),
  };
  return upsertDraft(blank);
}

// --- Cover Image (resize + persist as data URL) -----------------------------
export async function setDraftCoverImageFromFile(slug, file, { maxDim = 1400 } = {}) {
  if (!file || !slug) return getDraftBySlug(slug);

  const dataUrl = await fileToResizedDataURL(file, maxDim);
  const draft = getDraftBySlug(slug);
  if (!draft) return null;

  const imgMeta = await getImageMeta(dataUrl);
  const updated = upsertDraft({
    ...draft,
    coverImage: {
      dataUrl,
      mime: imgMeta.mime,
      width: imgMeta.width,
      height: imgMeta.height,
      updatedAt: nowIso(),
    },
  });
  return updated;
}

function fileToResizedDataURL(file, maxDim) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('File read error'));
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const { canvas, ctx, w, h } = makeCanvasFor(img, maxDim);
        ctx.drawImage(img, 0, 0, w, h);
        // Prefer original mime if supported, default to JPEG
        const outType = /png|webp|jpeg|jpg/i.test(file.type) ? file.type : 'image/jpeg';
        const out = canvas.toDataURL(outType, 0.9);
        resolve(out);
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
  let w, h;
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
      const mimeMatch = /^data:(.*?);base64,/.exec(dataUrl);
      resolve({
        width: img.width,
        height: img.height,
        mime: mimeMatch ? mimeMatch[1] : 'image/jpeg',
      });
    };
    img.src = dataUrl;
  });
}
