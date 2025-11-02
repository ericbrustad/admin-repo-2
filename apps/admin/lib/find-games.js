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

function readMeta(gameRoot) {
  const candidates = ['meta.json', 'game.json', 'info.json'];
  for (const name of candidates) {
    const p = path.join(gameRoot, name);
    if (safeExists(p)) {
      try {
        const json = JSON.parse(fs.readFileSync(p, 'utf8'));
        return {
          title: typeof json.title === 'string' ? json.title : null,
          channel: typeof json.channel === 'string'
            ? json.channel.toLowerCase()
            : typeof json.status === 'string'
            ? json.status.toLowerCase()
            : null,
        };
      } catch {
        // ignore parse errors
      }
    }
  }
  return { title: null, channel: null };
}

function collectFromBase(baseDir, out, seen) {
  const items = safeReaddir(baseDir);
  if (!items) return;
  for (const ent of items) {
    if (!ent.isDirectory()) continue;
    const slug = ent.name;
    const gameRoot = path.join(baseDir, slug);
    const hasDraft = safeExists(path.join(gameRoot, 'draft'));
    const hasPublished = safeExists(path.join(gameRoot, 'published'));
    const meta = readMeta(gameRoot);
    const title = meta.title || slug;

    if (hasPublished) {
      const key = `${slug}::published`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ slug, title, channel: 'published', source: gameRoot });
      }
    }
    if (hasDraft) {
      const key = `${slug}::draft`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ slug, title, channel: 'draft', source: gameRoot });
      }
    }
    if (!hasDraft && !hasPublished) {
      const ch =
        meta.channel === 'published'
          ? 'published'
          : meta.channel === 'draft'
          ? 'draft'
          : 'other';
      const key = `${slug}::${ch}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ slug, title, channel: ch, source: gameRoot });
      }
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
  const seen = new Set();
  for (const base of candidates) collectFromBase(base, out, seen);

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
    if (seen.has(key)) continue;
    seen.add(key);
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

