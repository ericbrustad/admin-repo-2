export const REG_KEY = 'erix:games:registry';
export const DRAFT_KEY = (slug) => `erix:admin:drafts:slug:${slug}`;
export const PUB_KEY = (slug) => `erix:admin:published:slug:${slug}`;
export const STARFIELD_DEFAULT = 'Starfield Station Break';

export function safeLocalStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'untitled';
}

export function nowIso() {
  return new Date().toISOString();
}

export function loadJSON(key, fallback = null) {
  const storage = safeLocalStorage();
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJSON(key, val) {
  const storage = safeLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(val));
  } catch {}
}

export function removeKey(key) {
  const storage = safeLocalStorage();
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {}
}

export function readRegistry() {
  return loadJSON(REG_KEY, []);
}

export function writeRegistry(list) {
  const clean = Array.isArray(list) ? list.filter(Boolean) : [];
  saveJSON(REG_KEY, clean);
  return clean;
}

export function normalizeGameEntry(entry) {
  if (!entry) return null;
  const slug = (entry.slug || '').toString().trim();
  if (!slug) return null;
  const channel = entry.channel === 'published' ? 'published' : 'draft';
  const title = (entry.title || '').toString().trim() || slug;
  const updatedAt = entry.updated_at || nowIso();
  return {
    id: entry.id ?? null,
    slug,
    title,
    channel,
    tag: entry.tag === 'published' || entry.channel === 'published' ? 'published' : 'draft',
    updated_at: updatedAt,
    source: entry.source || 'local',
  };
}

export function upsertRegistryEntry({ slug, title, channel = 'draft' }) {
  const list = readRegistry();
  const normalizedSlug = (slug || '').toString().trim();
  if (!normalizedSlug) return writeRegistry(list || []);
  const normalizedTitle = (title || '').toString().trim() || normalizedSlug;
  const normalizedChannel = channel === 'published' ? 'published' : 'draft';
  const entry = {
    slug: normalizedSlug,
    title: normalizedTitle,
    channel: normalizedChannel,
    tag: normalizedChannel,
    updated_at: nowIso(),
    id: null,
    source: 'local',
  };
  const records = Array.isArray(list) ? [...list] : [];
  const index = records.findIndex((g) => (g.slug || '') === normalizedSlug);
  if (index >= 0) {
    records[index] = { ...records[index], ...entry };
  } else {
    records.push(entry);
  }
  return writeRegistry(records);
}

export function removeFromRegistry(slug) {
  const normalizedSlug = (slug || '').toString().trim();
  if (!normalizedSlug) return writeRegistry(readRegistry());
  const list = readRegistry();
  const filtered = Array.isArray(list)
    ? list.filter((g) => (g.slug || '') !== normalizedSlug)
    : [];
  return writeRegistry(filtered);
}

export function readSnapshot(slug, channel) {
  const normalizedSlug = (slug || '').toString().trim();
  if (!normalizedSlug) return null;
  const key = channel === 'published' ? PUB_KEY(normalizedSlug) : DRAFT_KEY(normalizedSlug);
  return loadJSON(key, null);
}

export function writeSnapshot(slug, channel, payload) {
  const normalizedSlug = (slug || '').toString().trim();
  if (!normalizedSlug) return;
  const key = channel === 'published' ? PUB_KEY(normalizedSlug) : DRAFT_KEY(normalizedSlug);
  saveJSON(key, { ...(payload || {}), slug: normalizedSlug, channel, saved_at: nowIso() });
}

export function deleteSnapshot(slug, channel) {
  const normalizedSlug = (slug || '').toString().trim();
  if (!normalizedSlug) return;
  const key = channel === 'published' ? PUB_KEY(normalizedSlug) : DRAFT_KEY(normalizedSlug);
  removeKey(key);
}

export function seedConfig(title, slug) {
  return {
    splash: { enabled: false, mode: 'single' },
    game: {
      title,
      slug,
      mode: 'single',
      coverImage: '',
      tags: [slug],
      shortDescription: '',
      longDescription: '',
    },
    forms: { players: 1 },
    timer: { durationMinutes: 0, alertMinutes: 5 },
    map: { centerLat: 44.9778, centerLng: -93.265, defaultZoom: 13 },
    geofence: { mode: 'test' },
    icons: { missions: [], devices: [], rewards: [] },
    devices: [],
  };
}

export function seedSuite() {
  return { version: '1.0.0', missions: [] };
}

export function mergeFromSnapshots(list) {
  const storage = safeLocalStorage();
  const base = Array.isArray(list) ? [...list] : [];
  if (!storage) return base;
  const out = [...base];
  const seen = new Set(out.map((g) => g && g.slug));
  try {
    const length = storage.length || 0;
    for (let i = 0; i < length; i += 1) {
      const key = storage.key(i);
      if (!key) continue;
      if (!(key.startsWith('erix:admin:drafts:slug:') || key.startsWith('erix:admin:published:slug:'))) continue;
      const payload = loadJSON(key, null);
      const s = payload?.slug ? String(payload.slug).trim() : '';
      if (!s) continue;
      const ch = payload?.channel === 'published' || key.includes(':published:') ? 'published' : 'draft';
      const t = payload?.title ? String(payload.title).trim() : '';
      if (seen.has(s)) {
        out.forEach((game, idx) => {
          if (game?.slug === s) {
            out[idx] = {
              ...game,
              title: game.title || t || s,
              channel: game.channel === 'published' ? 'published' : ch,
              tag: game.tag === 'published' ? 'published' : ch,
              updated_at: game.updated_at || nowIso(),
            };
          }
        });
      } else {
        out.push({
          slug: s,
          title: t || s,
          channel: ch,
          tag: ch,
          updated_at: nowIso(),
          id: null,
          source: 'local',
        });
        seen.add(s);
      }
    }
  } catch (error) {
    console.warn('mergeFromSnapshots failed', error);
  }
  return out;
}

export async function bootstrapFromPublic() {
  if (typeof fetch !== 'function') return false;
  const storage = safeLocalStorage();
  if (!storage) return false;
  const tryPaths = ['/games/index.json', '/public/games/index.json'];
  for (const path of tryPaths) {
    try {
      const res = await fetch(path, { cache: 'no-store' });
      if (!res?.ok) continue;
      const idx = await res.json();
      if (Array.isArray(idx) && idx.length) {
        idx.forEach((entry) => {
          const slug = (entry?.slug || '').toString().trim();
          if (!slug) return;
          const title = (entry?.title || slug).toString().trim();
          upsertRegistryEntry({ slug, title, channel: 'draft' });
          const existing = readSnapshot(slug, 'draft');
          if (!existing) {
            writeSnapshot(slug, 'draft', {
              title,
              slug,
              channel: 'draft',
              config: seedConfig(title, slug),
              suite: seedSuite(),
            });
          }
        });
        return true;
      }
    } catch (error) {
      console.warn('Failed to bootstrap from', path, error);
    }
  }
  return false;
}

export function ensureAtLeastDefault() {
  const storage = safeLocalStorage();
  if (!storage) {
    return [
      {
        slug: 'default',
        title: STARFIELD_DEFAULT,
        channel: 'draft',
        tag: 'draft',
        updated_at: nowIso(),
        id: null,
        source: 'local',
      },
    ];
  }
  const list = readRegistry();
  if (Array.isArray(list) && list.length) return list;
  const slug = 'default';
  const title = STARFIELD_DEFAULT;
  upsertRegistryEntry({ slug, title, channel: 'draft' });
  writeSnapshot(slug, 'draft', {
    title,
    slug,
    channel: 'draft',
    config: seedConfig(title, slug),
    suite: seedSuite(),
  });
  return readRegistry();
}

export async function assembleLocalGameList({ forceBootstrap = false } = {}) {
  if (typeof window === 'undefined') {
    return [
      normalizeGameEntry({ slug: 'default', title: STARFIELD_DEFAULT, channel: 'draft' }),
    ].filter(Boolean);
  }
  const storage = safeLocalStorage();
  if (!storage) {
    return [
      normalizeGameEntry({ slug: 'default', title: STARFIELD_DEFAULT, channel: 'draft' }),
    ].filter(Boolean);
  }
  let list = readRegistry();
  if (forceBootstrap || !Array.isArray(list) || list.length === 0) {
    await bootstrapFromPublic();
    list = readRegistry();
  }
  list = mergeFromSnapshots(list);
  if (!Array.isArray(list) || list.length === 0) {
    list = ensureAtLeastDefault();
  }
  writeRegistry(list);
  return list.map(normalizeGameEntry).filter(Boolean);
}

export function getSnapshotFor(slug, channel) {
  const normalizedChannel = channel === 'published' ? 'published' : 'draft';
  const primary = readSnapshot(slug, normalizedChannel);
  if (primary) return primary;
  if (normalizedChannel !== 'draft') {
    const draft = readSnapshot(slug, 'draft');
    if (draft) return draft;
  }
  return null;
}
