// Esxape Ride — Codex helper (2025-11-03)
// Finds games on the filesystem. Priorities:
// 1) process.env.GAME_FILES_DIR
// 2) apps/admin/public/game-data
// 3) apps/game-web/public/game-data
// 4) public/game-data
// (Legacy fallback)
// 5) process.env.GAMES_DIR
// 6) apps/admin/public/games
// 7) apps/game-web/public/games
// 8) public/games
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

function normalizeSlug(value) {
  if (!value) return '';
  return String(value).trim().toLowerCase();
}

function normalizeChannelStrict(value) {
  const normalized = (value || '').toString().trim().toLowerCase();
  if (normalized === 'published') return 'published';
  if (normalized === 'draft') return 'draft';
  return 'draft';
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeRecord(record) {
  if (!record) return null;
  const slug = normalizeSlug(record.slug);
  if (!slug) return null;
  const channel = normalizeChannelStrict(record.channel);
  const title = normalizeString(record.title) || slug;
  const coverImage = normalizeString(record.coverImage);
  const shortDescription = normalizeString(record.shortDescription);
  const type = normalizeString(record.type);
  const mode = normalizeString(record.mode);
  const createdAt = normalizeString(record.createdAt);
  const updatedAt = normalizeString(record.updatedAt);
  const source = normalizeString(record.source);
  const location = normalizeString(record.location) || source;

  return {
    slug,
    title,
    channel,
    status: channel,
    published: channel === 'published',
    draft: channel !== 'published',
    coverImage,
    shortDescription,
    type,
    mode,
    createdAt,
    updatedAt,
    source,
    location,
  };
}

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

function loadIndexMeta(baseDir, fileName = 'index.json') {
  const metaPath = path.join(baseDir, fileName);
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
  const base = normalizeRecord(existing);
  const candidate = normalizeRecord(incoming);
  if (!base && !candidate) return null;
  if (!base) return candidate;
  if (!candidate) return base;

  const next = { ...base };

  const preferKeys = [
    'title',
    'coverImage',
    'shortDescription',
    'type',
    'mode',
  ];
  for (const key of preferKeys) {
    const current = normalizeString(next[key]);
    const incomingValue = normalizeString(candidate[key]);
    if (!current && incomingValue) {
      next[key] = incomingValue;
    }
  }

  if (!normalizeString(next.createdAt) && normalizeString(candidate.createdAt)) {
    next.createdAt = candidate.createdAt;
  }

  if (normalizeString(candidate.updatedAt)) {
    const prev = normalizeString(next.updatedAt);
    if (!prev || candidate.updatedAt > prev) {
      next.updatedAt = candidate.updatedAt;
    }
  }

  if (!normalizeString(next.source) && normalizeString(candidate.source)) {
    next.source = candidate.source;
  }

  if (!normalizeString(next.location) && normalizeString(candidate.location)) {
    next.location = candidate.location;
  }

  return normalizeRecord(next);
}

function upsertGame(out, indexByKey, record) {
  const normalized = normalizeRecord(record);
  if (!normalized) return;
  const key = `${normalized.slug}::${normalized.channel}`;
  if (indexByKey.has(key)) {
    const idx = indexByKey.get(key);
    const merged = mergeGame(out[idx], normalized);
    out[idx] = merged || normalized;
    return;
  }
  indexByKey.set(key, out.length);
  out.push(normalized);
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

function collectFromLegacyBase(baseDir, out, indexByKey) {
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
      upsertGame(out, indexByKey, {
        ...baseRecord,
        channel: 'published',
      });
    }
    if (hasDraft) {
      upsertGame(out, indexByKey, {
        ...baseRecord,
        channel: 'draft',
      });
    }
    if (!hasDraft && !hasPublished) {
      const metaChannel =
        normalizeChannel(meta.channel) ||
        normalizeChannel(slugMeta?.channel) ||
        'draft';
      upsertGame(out, indexByKey, {
        ...baseRecord,
        channel: metaChannel,
      });
    }
  }
}

function collectFromGameData(baseDir, out, indexByKey) {
  const items = safeReaddir(baseDir);
  if (!items) return false;
  const indexMeta = loadIndexMeta(baseDir, 'index.json');
  let foundAny = false;
  for (const ent of items) {
    if (!ent.isDirectory()) continue;
    const slug = ent.name;
    const gameRoot = path.join(baseDir, slug);
    const metadata = safeReadJson(path.join(gameRoot, 'metadata.json'));
    if (!metadata) continue;
    foundAny = true;
    const metaChannels = metadata?.channels && typeof metadata.channels === 'object' ? metadata.channels : {};
    const channels = Object.keys(metaChannels);
    const defaultChannel = normalizeChannelStrict(metadata?.channel) || 'draft';
    const channelList = channels.length ? channels : [defaultChannel];
    const source = metadata?.sources?.legacyIndex || indexMeta.get(slug) || null;
    for (const channelKey of channelList) {
      const normalizedChannel = normalizeChannelStrict(channelKey);
      const channelMeta = metaChannels[channelKey] || {};
      const channelDir = path.join(gameRoot, channelKey);
      const channelLocation = safeExists(channelDir) ? channelDir : gameRoot;
      const baseRecord = {
        slug,
        title: normalizeString(metadata.title) || normalizeString(source?.title) || slug,
        channel: normalizedChannel,
        coverImage: normalizeString(metadata.coverImage) || normalizeString(source?.coverImage) || '',
        shortDescription: normalizeString(metadata.shortDescription) || normalizeString(source?.shortDescription) || '',
        type: normalizeString(metadata.type) || normalizeString(source?.type) || '',
        mode: normalizeString(metadata.mode) || normalizeString(source?.mode) || '',
        createdAt: normalizeString(metadata.createdAt) || normalizeString(channelMeta.createdAt) || normalizeString(source?.createdAt) || '',
        updatedAt: normalizeString(metadata.updatedAt) || normalizeString(channelMeta.updatedAt) || normalizeString(source?.updatedAt) || '',
        source: channelLocation,
        location: gameRoot,
      };
      upsertGame(out, indexByKey, baseRecord);
    }
  }
  return foundAny;
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
  const modernCandidates = [
    process.env.GAME_FILES_DIR && path.resolve(process.env.GAME_FILES_DIR),
    path.join(process.cwd(), 'apps', 'admin', 'public', 'game-data'),
    path.join(process.cwd(), 'apps', 'game-web', 'public', 'game-data'),
    path.join(process.cwd(), 'public', 'game-data'),
  ].filter(Boolean);
  const legacyCandidates = [
    process.env.GAMES_DIR && path.resolve(process.env.GAMES_DIR),
    path.join(process.cwd(), 'apps', 'admin', 'public', 'games'),
    path.join(process.cwd(), 'apps', 'game-web', 'public', 'games'),
    path.join(process.cwd(), 'public', 'games'),
  ].filter(Boolean);

  const out = [];
  const indexByKey = new Map();
  let foundModern = false;
  for (const base of modernCandidates) {
    const collected = collectFromGameData(base, out, indexByKey);
    foundModern = collected || foundModern;
  }
  if (!foundModern) {
    for (const base of legacyCandidates) {
      collectFromLegacyBase(base, out, indexByKey);
    }
  }

  // Ensure "default" exists as a selectable template
  if (!out.some((g) => g.slug === 'default')) {
    upsertGame(out, indexByKey, {
      slug: 'default',
      title: 'Default',
      channel: 'draft',
      source: 'virtual',
    });
  }

  for (const fallback of FALLBACK_GAMES) {
    if (!fallback?.slug) continue;
    upsertGame(out, indexByKey, {
      slug: fallback.slug,
      title: fallback.title || fallback.slug,
      channel: fallback.channel,
      source: fallback.source || 'fallback',
    });
  }

  const normalizedList = out.map((record) => normalizeRecord(record)).filter(Boolean);

  const baseDirs = foundModern ? modernCandidates : [...modernCandidates, ...legacyCandidates];

  return {
    baseDirs,
    games: sortGames(normalizedList),
  };
}

