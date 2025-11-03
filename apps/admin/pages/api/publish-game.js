import { createClient } from '@supabase/supabase-js';

function adminClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  const { title, slug, payload } = req.body || {};
  if (!title || !slug) return res.status(400).json({ error: 'Missing title or slug' });

  const supa = adminClient();
  if (!supa) {
    return res.status(501).json({
      error: 'Supabase admin not configured',
      need: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
    });
  }

  try {
    const now = new Date().toISOString();
    const row = {
      title,
      slug,
      channel: 'published',
      config: payload ?? {},
      published_at: now,
      updated_at: now,
    };

    const { data, error } = await supa
      .from('games')
      .upsert(row, { onConflict: 'slug' })
      .select()
      .single();

    if (error) throw error;
    return res.status(200).json({ ok: true, game: data });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
