import { GAME_ENABLED } from '../../../lib/game-switch.js';

const GH_ROOT = 'https://api.github.com';
const OWNER = process.env.REPO_OWNER;
const REPO = process.env.REPO_NAME;
const TOKEN = process.env.GITHUB_TOKEN;
const BRANCH =
  process.env.REPO_BRANCH ||
  process.env.GITHUB_BRANCH ||
  process.env.VERCEL_GIT_COMMIT_REF ||
  process.env.COMMIT_REF ||
  'main';

const INDEX_PATH = 'public/game-data/index.json';

function normalizeSlug(value) {
  const raw = (value || '').toString().trim();
  if (!raw) return '';
  return raw;
}

function normalizeChannel(value) {
  const raw = (value || '').toString().trim().toLowerCase();
  if (raw === 'published') return 'published';
  if (raw === 'default') return 'draft';
  return 'draft';
}

function normalizeString(value) {
  if (value == null) return '';
  const str = String(value);
  return str.trim();
}

async function githubRequest(path, init = {}) {
  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    'User-Agent': 'esx-admin',
    Accept: 'application/vnd.github+json',
    ...init.headers,
  };
  const url = `${GH_ROOT}/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path)}${init.method === 'PUT' ? '' : `?ref=${BRANCH}`}`;
  const response = await fetch(url, {
    ...init,
    headers,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub ${init.method || 'GET'} ${path} ${response.status}: ${text}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function loadIndex() {
  try {
    const json = await githubRequest(INDEX_PATH);
    const content = Buffer.from(json.content || '', 'base64').toString('utf8');
    const list = JSON.parse(content || '[]');
    return { list: Array.isArray(list) ? list : [], sha: json.sha || null };
  } catch (error) {
    if (error.message && /404/.test(error.message)) {
      return { list: [], sha: null };
    }
    throw error;
  }
}

async function writeIndex(list, sha) {
  const body = JSON.stringify(list, null, 2);
  const payload = {
    message: 'chore: update games metadata index',
    content: Buffer.from(body, 'utf8').toString('base64'),
    branch: BRANCH,
  };
  if (sha) payload.sha = sha;
  await githubRequest(INDEX_PATH, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function loadMetadataFile(slug) {
  const path = `public/game-data/${slug}/metadata.json`;
  try {
    const json = await githubRequest(path);
    const content = Buffer.from(json.content || '', 'base64').toString('utf8');
    const data = JSON.parse(content || '{}');
    return { data, sha: json.sha || null, path };
  } catch (error) {
    if (error.message && /404/.test(error.message)) {
      return { data: {}, sha: null, path };
    }
    throw error;
  }
}

async function writeMetadataFile(slug, entry) {
  const { data: existing, sha, path } = await loadMetadataFile(slug);
  const next = {
    ...(existing || {}),
    ...entry,
    slug,
    updatedAt: new Date().toISOString(),
  };
  const body = JSON.stringify(next, null, 2);
  const payload = {
    message: `chore: update metadata for ${slug}`,
    content: Buffer.from(body, 'utf8').toString('base64'),
    branch: BRANCH,
  };
  if (sha) payload.sha = sha;
  await githubRequest(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  if (!OWNER || !REPO || !TOKEN) {
    return res.status(500).json({ ok: false, error: 'GitHub configuration missing' });
  }

  try {
    const {
      slug: slugInput,
      channel: channelInput,
      metadata: metadataInput = {},
    } = req.body || {};

    const slug = normalizeSlug(slugInput);
    if (!slug) {
      return res.status(400).json({ ok: false, error: 'Missing slug' });
    }

    const channel = normalizeChannel(channelInput);

    const { list, sha } = await loadIndex();

    const normalizedList = Array.isArray(list) ? list.slice() : [];
    const existingIndex = normalizedList.findIndex((entry) => entry && normalizeSlug(entry.slug) === slug);
    const existing = existingIndex >= 0 ? { ...normalizedList[existingIndex] } : {};

    const nextEntry = {
      ...existing,
      slug,
      channel,
    };

    const title = normalizeString(metadataInput.title || existing.title || slug);
    if (title) nextEntry.title = title;

    const type = normalizeString(metadataInput.type || existing.type || '');
    if (type || existing.type) nextEntry.type = type;

    const mode = normalizeString(metadataInput.mode || existing.mode || '');
    if (mode || existing.mode) nextEntry.mode = mode;

    const coverImage = normalizeString(metadataInput.coverImage || existing.coverImage || '');
    nextEntry.coverImage = coverImage;

    const shortDescription = normalizeString(metadataInput.shortDescription || existing.shortDescription || '');
    nextEntry.shortDescription = shortDescription;

    const createdAt = normalizeString(metadataInput.createdAt || existing.createdAt || '');
    nextEntry.createdAt = createdAt || new Date().toISOString();

    if (existingIndex >= 0) {
      normalizedList[existingIndex] = nextEntry;
    } else {
      normalizedList.push(nextEntry);
    }

    await writeIndex(normalizedList, sha);

    const summaryDescription =
      typeof metadataInput.description === 'string' && metadataInput.description
        ? metadataInput.description
        : (typeof metadataInput.longDescription === 'string' ? metadataInput.longDescription : '');
    const summaryTags = Array.isArray(metadataInput.tags)
      ? metadataInput.tags
      : Array.isArray(metadataInput.summary?.tags)
        ? metadataInput.summary.tags
        : [];

    await writeMetadataFile(slug, {
      title,
      coverImage,
      shortDescription,
      type,
      mode,
      channel,
      createdAt,
      summary: {
        description: summaryDescription,
        shortDescription,
        tags: summaryTags,
      },
    });

    res.status(200).json({ ok: true, entry: nextEntry, gameProjectEnabled: GAME_ENABLED });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || 'Failed to update metadata' });
  }
}
