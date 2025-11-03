// pages/api/config.js
// -------------------
import { promises as fs } from 'fs';
import path from 'path';

const GH = 'https://api.github.com';
const owner  = process.env.REPO_OWNER;
const repo   = process.env.REPO_NAME;
const token  = process.env.GITHUB_TOKEN;
const branch = process.env.REPO_BRANCH || 'main';

const authHeaders = {
  'User-Agent': 'esx-admin',
  Accept: 'application/vnd.github+json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};

const hasGithubConfig = Boolean(owner && repo && token);
const STARFIELD_CANONICAL_SLUG = 'starfield-station-break';

function canonicalSlug(raw) {
  const slug = (raw || '').toString().trim();
  if (!slug || slug === 'default') return STARFIELD_CANONICAL_SLUG;
  return slug;
}

async function readLocalFile(filePath) {
  try {
    const abs = path.join(process.cwd(), filePath);
    const text = await fs.readFile(abs, 'utf8');
    return { sha: null, text };
  } catch {
    return null;
  }
}

async function getFile(filePath) {
  if (!hasGithubConfig) {
    return readLocalFile(filePath);
  }
  try {
    const url = `${GH}/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${branch}`;
    const res = await fetch(url, { headers: authHeaders });
    if (!res.ok) {
      return readLocalFile(filePath);
    }
    const json = await res.json();
    const text = Buffer.from(json.content || '', 'base64').toString('utf8');
    return { sha: json.sha, text };
  } catch (error) {
    return readLocalFile(filePath);
  }
}

export default async function handler(req, res) {
  try {
    const slug = canonicalSlug(req.query.slug || '');
    const base = `public/game-data/${slug}`;
    const candidates = [
      `${base}/config.json`,
      `${base}/published/config.json`,
      `${base}/draft/config.json`,
      `public/games/${slug}/config.json`,
    ];

    for (const targetPath of candidates) {
      const file = await getFile(targetPath);
      if (file) {
        try {
          return res.status(200).json(JSON.parse(file.text || '{}'));
        } catch {
          // continue to next candidate if parse fails
        }
      }
    }

    return res.status(200).json({});
  } catch (e) {
    return res.status(500).send(String(e?.message || e));
  }
}
