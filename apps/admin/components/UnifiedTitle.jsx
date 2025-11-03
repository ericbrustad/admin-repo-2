"use client";

// CODEx PATCH — Unified Title + Slug & Header Sync
// Drop-in replacement for BOTH title editors & their "Save Title" buttons.
// Renders a single title input. As you type:
//  • updates the preview slug
//  • fires an event so the header shows the live title
//  • lets your existing "Close & Save Settings" button persist everything.
//
// USAGE:
// import UnifiedTitle from '@/components/UnifiedTitle';
// <UnifiedTitle
//    value={game.title}
//    currentSlug={game.slug}                // the saved slug (draft or published)
//    onChange={(next) => setGame(d => ({...d, ...next}))} // update your local game state
// />
//
// OPTIONAL (header bridge): see snippet after this file.

import React, { useEffect, useMemo, useState } from 'react';

function slugify(input = '') {
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function UnifiedTitle({
  value = '',
  currentSlug = '',
  onChange,
  label = 'Game Title',
}) {
  const [title, setTitle] = useState(value);

  useEffect(() => setTitle(value), [value]);

  const previewSlug = useMemo(() => slugify(title), [title]);

  useEffect(() => {
    const next = { title, slug: previewSlug };
    onChange?.(next);

    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      try {
        window.dispatchEvent(new CustomEvent('esx:gameTitleChanged', { detail: next }));
      } catch (err) {
        console.warn('[UnifiedTitle] Unable to dispatch title change event', err);
      }
    }
  }, [title, previewSlug, onChange]);

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ fontWeight: 600 }}>{label}</div>
      <input
        aria-label="Game Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Enter game title…"
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 10,
          border: '1px solid rgba(0,0,0,0.15)',
          fontSize: 16,
        }}
      />

      <div
        style={{
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
          fontSize: 12,
          color: 'rgba(0,0,0,0.65)',
        }}
      >
        <div>
          <span style={{ opacity: 0.7, marginRight: 6 }}>Current Tag:</span>
          <span style={pillStyle}>{currentSlug || '—'}</span>
        </div>
        <div>
          <span style={{ opacity: 0.7, marginRight: 6 }}>Preview Tag:</span>
          <span style={pillStyle}>{previewSlug || '—'}</span>
        </div>
      </div>
    </div>
  );
}

const pillStyle = {
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: 999,
  border: '1px solid rgba(0,0,0,0.1)',
  background: 'rgba(0,0,0,0.04)',
};

