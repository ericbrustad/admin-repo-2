#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';

const ROOT = process.cwd();
const SOURCE_ROOT = path.join(ROOT, 'apps', 'admin', 'public', 'games');
const TARGET_ROOT = path.join(ROOT, 'apps', 'admin', 'public', 'game-data');

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfExists(p) {
  if (!(await pathExists(p))) return null;
  try {
    const text = await fs.readFile(p, 'utf8');
    return JSON.parse(text);
  } catch (err) {
    console.warn('[rebuild-game-files] Failed to parse JSON', p, err.message || err);
    return null;
  }
}

async function copyTree(src, dest) {
  if (!(await pathExists(src))) return false;
  const stats = await fs.stat(src);
  if (!stats.isDirectory()) {
    const data = await fs.readFile(src);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, data);
    return true;
  }
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  let copied = false;
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      const sub = await copyTree(srcPath, destPath);
      copied = copied || sub;
    } else if (entry.isFile()) {
      const data = await fs.readFile(srcPath);
      await fs.writeFile(destPath, data);
      copied = true;
    }
  }
  return copied;
}

function pickGameSummary(game = {}) {
  const summary = {};
  const fields = [
    'title',
    'slug',
    'type',
    'mode',
    'tags',
    'coverImage',
    'shortDescription',
    'longDescription',
    'deployEnabled',
  ];
  for (const key of fields) {
    if (game[key] !== undefined) summary[key] = game[key];
  }
  return summary;
}

function deriveMeta({ slug, indexEntry, canonicalConfig, draftConfig }) {
  const gameNode = canonicalConfig?.game || {};
  const draftNode = draftConfig?.game || {};
  const fallbackTitle = indexEntry?.title || gameNode.title || draftNode.title || slug;
  const coverImage = indexEntry?.coverImage || gameNode.coverImage || draftNode.coverImage || '';
  const shortDescription = indexEntry?.shortDescription || gameNode.shortDescription || draftNode.shortDescription || '';
  const longDescription = gameNode.longDescription || draftNode.longDescription || '';
  const type = indexEntry?.type || gameNode.type || draftNode.type || '';
  const mode = indexEntry?.mode || gameNode.mode || draftNode.mode || canonicalConfig?.splash?.mode || draftConfig?.splash?.mode || '';
  const tags = Array.isArray(gameNode.tags) && gameNode.tags.length
    ? gameNode.tags
    : Array.isArray(draftNode.tags) && draftNode.tags.length
      ? draftNode.tags
      : Array.isArray(indexEntry?.tags)
        ? indexEntry.tags
        : [];
  const createdAt = indexEntry?.createdAt || gameNode.createdAt || draftNode.createdAt || '';
  const updatedAt = indexEntry?.updatedAt || canonicalConfig?.updatedAt || draftConfig?.updatedAt || '';
  const primaryChannel = indexEntry?.channel || draftConfig ? 'draft' : 'published';

  return {
    slug,
    title: fallbackTitle,
    coverImage,
    shortDescription,
    longDescription,
    type,
    mode,
    tags,
    createdAt,
    updatedAt,
    channel: primaryChannel,
  };
}

async function main() {
  if (!(await pathExists(SOURCE_ROOT))) {
    console.error('[rebuild-game-files] Source directory missing:', SOURCE_ROOT);
    process.exitCode = 1;
    return;
  }

  const legacyIndex = await readJsonIfExists(path.join(SOURCE_ROOT, 'index.json'));
  const indexMap = new Map();
  if (Array.isArray(legacyIndex)) {
    for (const entry of legacyIndex) {
      if (entry && typeof entry.slug === 'string') {
        indexMap.set(entry.slug, entry);
      }
    }
  }

  await fs.rm(TARGET_ROOT, { recursive: true, force: true });
  await fs.mkdir(TARGET_ROOT, { recursive: true });

  const entries = await fs.readdir(SOURCE_ROOT, { withFileTypes: true });
  const catalog = [];
  const metadataMap = {};

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'media') continue;
    const slug = entry.name;
    const sourceSlugDir = path.join(SOURCE_ROOT, slug);
    const targetSlugDir = path.join(TARGET_ROOT, slug);

    const canonicalConfig = await readJsonIfExists(path.join(sourceSlugDir, 'config.json'));
    const draftConfig = await readJsonIfExists(path.join(sourceSlugDir, 'draft', 'config.json'));
    const canonicalMissions = await readJsonIfExists(path.join(sourceSlugDir, 'missions.json'));
    const draftMissions = await readJsonIfExists(path.join(sourceSlugDir, 'draft', 'missions.json'));

    const meta = deriveMeta({
      slug,
      indexEntry: indexMap.get(slug) || null,
      canonicalConfig,
      draftConfig,
    });

    const channels = {};

    if (canonicalConfig || canonicalMissions) {
      channels.published = {
        hasConfig: Boolean(canonicalConfig),
        hasMissions: Boolean(canonicalMissions),
        updatedAt: canonicalConfig?.updatedAt || canonicalConfig?.game?.updatedAt || meta.updatedAt || '',
      };
    }

    if (draftConfig || draftMissions) {
      channels.draft = {
        hasConfig: Boolean(draftConfig || canonicalConfig),
        hasMissions: Boolean(draftMissions || canonicalMissions),
        updatedAt: draftConfig?.updatedAt || draftConfig?.game?.updatedAt || meta.updatedAt || '',
      };
    }

    // Copy everything into the target directory
    await copyTree(sourceSlugDir, targetSlugDir);

    const metadata = {
      ...meta,
      channels,
      summary: {
        description: meta.longDescription,
        shortDescription: meta.shortDescription,
        tags: meta.tags,
      },
      sources: {
        legacyIndex: indexMap.get(slug) || null,
        canonicalGame: pickGameSummary(canonicalConfig?.game || {}),
        draftGame: pickGameSummary(draftConfig?.game || {}),
      },
    };

    const metadataJson = JSON.stringify(metadata, null, 2);
    await fs.writeFile(
      path.join(targetSlugDir, 'metadata.json'),
      `${metadataJson}\n`,
      'utf8',
    );

    catalog.push({
      slug,
      title: metadata.title,
      channel: metadata.channel,
      coverImage: metadata.coverImage,
      shortDescription: metadata.shortDescription,
      type: metadata.type,
      mode: metadata.mode,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
      channels: Object.keys(channels),
    });

    metadataMap[slug] = metadata;
  }

  catalog.sort((a, b) => a.slug.localeCompare(b.slug));
  const indexJson = JSON.stringify(catalog, null, 2);
  await fs.writeFile(path.join(TARGET_ROOT, 'index.json'), `${indexJson}\n`, 'utf8');

  const generatedModule = [
    '// Auto-generated by scripts/rebuild-game-files.js',
    '// Do not edit directly — run the script to refresh.',
    '',
    `export const GAME_CATALOG = ${indexJson};`,
    '',
    `export const GAME_METADATA = ${JSON.stringify(metadataMap, null, 2)};`,
    '',
  ].join('\n');
  const generatedPath = path.join(ROOT, 'apps', 'admin', 'lib', 'game-data.generated.js');
  await fs.writeFile(generatedPath, `${generatedModule}`, 'utf8');

  console.log(`[rebuild-game-files] Wrote ${catalog.length} game entries to ${TARGET_ROOT}`);
  console.log(`[rebuild-game-files] Updated catalog module at ${generatedPath}`);
}

main().catch((err) => {
  console.error('[rebuild-game-files] Fatal error:', err);
  process.exitCode = 1;
});
