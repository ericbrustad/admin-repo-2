/* eslint-disable no-console */

const STORAGE_PREFIX = 'erix:drafts';
const INDEX_KEY = `${STORAGE_PREFIX}:index`;
const REC_KEY = (slug) => `${STORAGE_PREFIX}:${slug}`;

function isBrowser() {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function safeGet(key) {
  if (!isBrowser()) return null;
  try {
    return localStorage.getItem(key);
  } catch (e) {
    console.warn('localStorage.getItem failed', key, e);
    return null;
  }
}

function safeSet(key, value) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.warn('localStorage.setItem failed', key, e);
  }
}

function safeRemove(key) {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.warn('localStorage.removeItem failed', key, e);
  }
}

export function slugify(input = '') {
  return String(input)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80) || 'untitled';
}

function nowIso() {
  return new Date().toISOString();
}

function readIndex() {
  const raw = safeGet(INDEX_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeIndex(list) {
  safeSet(INDEX_KEY, JSON.stringify(list));
}

function upsertIndexEntry(entry) {
  const list = readIndex();
  const i = list.findIndex((x) => x.slug === entry.slug);
  if (i === -1) list.unshift(entry); else list[i] = { ...list[i], ...entry };
  // de-dupe any accidental dupes
  const seen = new Set();
  const deduped = [];
  for (const x of list) {
    if (seen.has(x.slug)) continue;
    seen.add(x.slug);
    deduped.push(x);
  }
  // sort newest-first by updatedAt if present
  deduped.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  writeIndex(deduped);
}

function removeIndexEntry(slug) {
  const next = readIndex().filter((x) => x.slug !== slug);
  writeIndex(next);
}

function normalizeGame(input = {}) {
  const title = (input.title || '').trim();
  const proposedSlug = input.slug?.trim();
  const autoSlug = slugify(title || proposedSlug || '');
  const slug = proposedSlug && slugify(proposedSlug) !== '' ? slugify(proposedSlug) : autoSlug;
  const appearance = input.appearance || {};
  const coverUrl = input.coverUrl || input.coverImage || '';
  const channel = String(input.channel || 'draft').toLowerCase();
  return { ...input, title, slug, appearance, coverUrl, channel };
}

function dispatch(evt, detail) {
  if (!isBrowser()) return;
  try {
    window.dispatchEvent(new CustomEvent(evt, { detail }));
  } catch {}
}

/**
 * Save or rename a DRAFT locally. Refuses to overwrite a published record.
 * Auto-updates slug when title changes; removes old key when slug changes.
 *
 * @param {Object} game - current game state from your form/editor
 * @param {Object} [opts]
 * @param {(g:Object)=>void} [opts.onGameChange] - called with normalized state
 * @param {(rec:Object)=>void} [opts.onAfterSave]
 * @param {boolean} [opts.allowPublished=false] - set true to bypass channel guard
 * @returns {Promise<Object>} saved record
 */
export async function saveDraft(game, opts = {}) {
  if (!isBrowser()) throw new Error('Not in a browser context.');
  const { onGameChange, onAfterSave, allowPublished = false } = opts;

  const current = normalizeGame(game);
  if (!current.title) throw new Error('Please enter a title before saving.');
  if (!allowPublished && current.channel === 'published') {
    throw new Error('This game is marked as PUBLISHED. Use your Publish flow.');
  }

  // If title change implies slug change, treat as rename (remove old key)
  const oldSlug = (game && game.slug ? slugify(game.slug) : '') || '';
  const newSlug = current.slug || slugify(current.title);

  const record = {
    ...current,
    slug: newSlug,
    channel: 'draft', // always persist as draft locally
    updatedAt: nowIso(),
    _index: {
      slug: newSlug,
      title: current.title,
      coverUrl: current.coverUrl || '',
      appearance: current.appearance || {},
      channel: 'draft',
      updatedAt: nowIso(),
    },
  };

  safeSet(REC_KEY(newSlug), JSON.stringify(record));
  upsertIndexEntry(record._index);

  if (oldSlug && oldSlug !== newSlug) {
    // migrate old key/index
    safeRemove(REC_KEY(oldSlug));
    removeIndexEntry(oldSlug);
  }

  onGameChange?.(record);
  onAfterSave?.(record);
  dispatch('erix:drafts:saved', { slug: newSlug, record });
  return record;
}

/**
 * Delete a draft by slug or by passing the game object.
 * @param {string|Object} gameOrSlug
 * @param {Object} [opts]
 * @param {(g:Object)=>void} [opts.onGameChange]
 * @param {(slug:string)=>void} [opts.onAfterDelete]
 */
export async function deleteDraft(gameOrSlug, opts = {}) {
  if (!isBrowser()) throw new Error('Not in a browser context.');
  const { onGameChange, onAfterDelete } = opts;
  const slug = typeof gameOrSlug === 'string'
    ? slugify(gameOrSlug)
    : slugify(gameOrSlug?.slug || gameOrSlug?.title || '');
  if (!slug) throw new Error('Select a saved game to delete.');

  safeRemove(REC_KEY(slug));
  removeIndexEntry(slug);

  onGameChange?.({ title: '', slug: '', channel: 'draft' });
  onAfterDelete?.(slug);
  dispatch('erix:drafts:deleted', { slug });
}

/**
 * List saved drafts for your dropdown.
 * @returns {Array<{slug:string,title:string,coverUrl?:string,appearance?:Object,updatedAt?:string}>}
 */
export function listDrafts() {
  return readIndex();
}

/**
 * Load a draft record by slug.
 * @param {string} slug
 * @returns {Object|null}
 */
export function loadDraft(slug) {
  const raw = safeGet(REC_KEY(slug));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Optional: tiny helpers your UI may find handy
export function hasDraft(slug) {
  return !!safeGet(REC_KEY(slug));
}

export function clearAllDrafts() {
  if (!isBrowser()) return 0;
  const items = readIndex();
  for (const it of items) safeRemove(REC_KEY(it.slug));
  writeIndex([]);
  return items.length;
}

export default {
  saveDraft,
  deleteDraft,
  listDrafts,
  loadDraft,
  hasDraft,
  clearAllDrafts,
  slugify,
};
