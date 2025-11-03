// Esxape Ride — Codex helper (2025-10-30)
// Finds games on the filesystem. Priorities:
// 1) process.env.GAMES_DIR
// 2) apps/admin/public/games
// 3) apps/game-web/public/games
// 4) public/games
import fs from 'fs';
import path from 'path';

const FALLBACK_GAMES = [
  { slug: 'default', title: 'Default', channel: 'draft' },
  { slug: 'holiday-christmas', title: 'Christmas Village', channel: 'draft' },
  { slug: 'holiday-halloween', title: 'Halloween Harvest', channel: 'draft' },
  { slug: 'harvest-thanksgiving', title: 'Thanksgiving Harvest', channel: 'draft' },
  { slug: 'harvest-turkey-trail', title: 'Turkey Trail', channel: 'draft' },
  { slug: 'freedom-fireworks', title: 'Fourth of July Fireworks', channel: 'published' },
  { slug: 'independence-rally', title: 'Independence Day Rally', channel: 'draft' },
  { slug: 'valentines-heartbeat', title: 'Valentine Heartbeat', channel: 'draft' },
  { slug: 'mothers-day-bouquet', title: "Mother's Day Bouquet", channel: 'draft' },
  { slug: 'fathers-day-forge', title: "Father's Day Forge", channel: 'draft' },
  { slug: 'warfront-briefing', title: 'Warfront Briefing', channel: 'draft' },
  { slug: 'military-camouflage', title: 'Camouflage Command', channel: 'draft' },
  { slug: 'nature-woodland', title: 'Whispering Woods', channel: 'draft' },
  { slug: 'nature-emerald-canopy', title: 'Emerald Canopy', channel: 'draft' },
  { slug: 'lucky-clover-field', title: 'Lucky Clover Field', channel: 'draft' },
];

function safeReaddir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
}

function safeExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function safeReadJson(p) {
  try {
    const text = fs.readFileSync(p, 'utf8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeChannel(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'published') return 'published';
  if (normalized === 'draft') return 'draft';
  return null;
}

function loadIndexMeta(baseDir) {
  const metaPath = path.join(baseDir, 'index.json');
  const arr = safeReadJson(metaPath);
  const map = new Map();
  if (Array.isArray(arr)) {
    for (const entry of arr) {
      if (entry && typeof entry.slug === 'string') {
        map.set(entry.slug, entry);
      }
    }
  }
  return map;
}

function mergeGame(existing, incoming) {
  const next = { ...existing };
  let changed = false;
  for (const key of [
    'title',
    'channel',
    'coverImage',
    'shortDescription',
    'type',
    'mode',
    'createdAt',
    'updatedAt',
  ]) {
    const current = next[key];
    const candidate = incoming[key];
    if (
      (candidate != null && candidate !== '' &&
        (current == null || current === '' || current === existing.slug))
    ) {
      next[key] = candidate;
      changed = true;
    }
  }
  if (incoming.source && !next.source) {
    next.source = incoming.source;
    changed = true;
  }
  return changed ? next : existing;
}

function upsertGame(out, indexByKey, key, record) {
  if (indexByKey.has(key)) {
    const idx = indexByKey.get(key);
    out[idx] = mergeGame(out[idx], record);
    return;
  }
  indexByKey.set(key, out.length);
  out.push(record);
}

function readMeta(gameRoot, slugMeta) {
  const candidates = ['meta.json', 'game.json', 'info.json'];
  for (const name of candidates) {
    const p = path.join(gameRoot, name);
    if (safeExists(p)) {
      try {
        const json = JSON.parse(fs.readFileSync(p, 'utf8'));
        return {
          title: typeof json.title === 'string' ? json.title : null,
          channel:
            normalizeChannel(json.channel) ?? normalizeChannel(json.status) ?? null,
          coverImage: typeof json.coverImage === 'string' ? json.coverImage : null,
          shortDescription:
            typeof json.shortDescription === 'string' ? json.shortDescription : null,
          type: typeof json.type === 'string' ? json.type : null,
          mode: typeof json.mode === 'string' ? json.mode : null,
          createdAt: typeof json.createdAt === 'string' ? json.createdAt : null,
          updatedAt: typeof json.updatedAt === 'string' ? json.updatedAt : null,
        };
      } catch {
        // ignore parse errors
      }
    }
  }
  const metaChannel = normalizeChannel(slugMeta?.channel);
  return {
    title: slugMeta?.title || null,
    channel: metaChannel,
    coverImage: slugMeta?.coverImage || null,
    shortDescription: slugMeta?.shortDescription || null,
    type: slugMeta?.type || null,
    mode: slugMeta?.mode || null,
    createdAt: slugMeta?.createdAt || null,
    updatedAt: slugMeta?.updatedAt || null,
  };
}

function collectFromBase(baseDir, out, indexByKey) {
  const items = safeReaddir(baseDir);
  if (!items) return;
  const indexMeta = loadIndexMeta(baseDir);
  for (const ent of items) {
    if (!ent.isDirectory()) continue;
    const slug = ent.name;
    const gameRoot = path.join(baseDir, slug);
    const hasDraft = safeExists(path.join(gameRoot, 'draft'));
    const hasPublished = safeExists(path.join(gameRoot, 'published'));
    const slugMeta = indexMeta.get(slug) || null;
    const meta = readMeta(gameRoot, slugMeta);
    const title = meta.title || slug;
    const baseRecord = {
      slug,
      title,
      coverImage: meta.coverImage || slugMeta?.coverImage || null,
      shortDescription: meta.shortDescription || slugMeta?.shortDescription || null,
      type: meta.type || slugMeta?.type || null,
      mode: meta.mode || slugMeta?.mode || null,
      createdAt: meta.createdAt || slugMeta?.createdAt || null,
      updatedAt: meta.updatedAt || slugMeta?.updatedAt || null,
      source: gameRoot,
    };

    if (hasPublished) {
      const key = `${slug}::published`;
      upsertGame(out, indexByKey, key, {
        ...baseRecord,
        channel: 'published',
      });
    }
    if (hasDraft) {
      const key = `${slug}::draft`;
      upsertGame(out, indexByKey, key, {
        ...baseRecord,
        channel: 'draft',
      });
    }
    if (!hasDraft && !hasPublished) {
      const metaChannel =
        normalizeChannel(meta.channel) ||
        normalizeChannel(slugMeta?.channel) ||
        'draft';
      const key = `${slug}::${metaChannel}`;
      upsertGame(out, indexByKey, key, {
        ...baseRecord,
        channel: metaChannel,
      });
    }
  }
}

function sortGames(list) {
  const order = { published: 0, draft: 1, other: 2 };
  return list.sort((a, b) => {
    if (a.slug === 'default' && b.slug !== 'default') return -1;
    if (b.slug === 'default' && a.slug !== 'default') return 1;
    const c =
      (order[a.channel] ?? 9) -
      (order[b.channel] ?? 9);
    if (c !== 0) return c;
    const t = (a.title || '').localeCompare(b.title || '', undefined, {
      numeric: true,
      sensitivity: 'base',
    });
    if (t !== 0) return t;
    return a.slug.localeCompare(b.slug, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  });
}

export function findGames() {
  const candidates = [
    process.env.GAMES_DIR && path.resolve(process.env.GAMES_DIR),
    path.join(process.cwd(), 'apps', 'admin', 'public', 'games'),
    path.join(process.cwd(), 'apps', 'game-web', 'public', 'games'),
    path.join(process.cwd(), 'public', 'games'),
  ].filter(Boolean);

  const out = [];
  const indexByKey = new Map();
  for (const base of candidates) collectFromBase(base, out, indexByKey);

  // Ensure "default" exists as a selectable template
  if (!out.some((g) => g.slug === 'default')) {
    out.push({
      slug: 'default',
      title: 'Default',
      channel: 'draft',
      source: 'virtual',
    });
  }

  for (const fallback of FALLBACK_GAMES) {
    if (!fallback?.slug) continue;
    const channel = fallback.channel === 'published' ? 'published' : 'draft';
    const key = `${fallback.slug}::${channel}`;
    if (indexByKey.has(key)) continue;
    indexByKey.set(key, out.length);
    out.push({
      slug: fallback.slug,
      title: fallback.title || fallback.slug,
      channel,
      source: fallback.source || 'fallback',
    });
  }

  return {
    baseDirs: candidates,
    games: sortGames(out),
  };
}

