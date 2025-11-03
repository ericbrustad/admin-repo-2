"use client";

// apps/admin/components/MetadataEditor.jsx
import React, { useEffect, useState } from 'react';
import { updateMetadata } from '../lib/store';

const EMPTY_STATE = Object.freeze({
  description: '',
  tagsText: '',
  category: '',
  difficulty: '',
  duration: '',
  centerLat: '',
  centerLng: '',
});

function toState(meta) {
  const safe = meta && typeof meta === 'object' ? meta : {};
  const center = safe.center && typeof safe.center === 'object' ? safe.center : {};
  return {
    description: typeof safe.description === 'string' ? safe.description : '',
    tagsText: Array.isArray(safe.tags) ? safe.tags.join(', ') : typeof safe.tags === 'string' ? safe.tags : '',
    category: typeof safe.category === 'string' ? safe.category : '',
    difficulty: typeof safe.difficulty === 'string' ? safe.difficulty : '',
    duration:
      typeof safe.durationMins === 'number' && Number.isFinite(safe.durationMins)
        ? String(safe.durationMins)
        : safe.durationMins && typeof safe.durationMins !== 'object'
        ? String(safe.durationMins)
        : '',
    centerLat:
      typeof center.lat === 'number' && Number.isFinite(center.lat)
        ? String(center.lat)
        : center.lat && typeof center.lat !== 'object'
        ? String(center.lat)
        : '',
    centerLng:
      typeof center.lng === 'number' && Number.isFinite(center.lng)
        ? String(center.lng)
        : center.lng && typeof center.lng !== 'object'
        ? String(center.lng)
        : '',
  };
}

function parseTags(value) {
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function parseNumber(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

export default function MetadataEditor({ game, onSaved }) {
  const [state, setState] = useState(EMPTY_STATE);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!game) {
      setState(EMPTY_STATE);
      setDirty(false);
      return;
    }
    const nextState = toState(game.payload?.meta);
    setState(nextState);
    setDirty(false);
  }, [game?.slug]);

  useEffect(() => {
    if (!game || !dirty) return undefined;
    const handle = setTimeout(() => {
      const patch = {
        description: state.description,
        tags: parseTags(state.tagsText),
        category: state.category,
        difficulty: state.difficulty,
        durationMins: parseNumber(state.duration),
        center: {
          lat: parseNumber(state.centerLat),
          lng: parseNumber(state.centerLng),
        },
      };
      const updated = updateMetadata(game.slug, patch);
      if (typeof onSaved === 'function') {
        onSaved(updated);
      }
      setDirty(false);
    }, 400);
    return () => clearTimeout(handle);
  }, [game, dirty, state, onSaved]);

  const disableInputs = !game;

  if (!game) {
    return null;
  }

  const onFieldChange = (field) => (event) => {
    const value = event?.target?.value ?? '';
    setState((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  return (
    <div className="border rounded p-3 flex flex-col gap-3" style={{ gridColumn: '1 / -1' }}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Metadata</h3>
        <span className="text-xs opacity-60">Changes save automatically</span>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Description</span>
        <textarea
          value={state.description}
          onChange={onFieldChange('description')}
          className="border rounded px-2 py-1"
          rows={3}
          placeholder="Short description"
          disabled={disableInputs}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Tags</span>
        <input
          type="text"
          value={state.tagsText}
          onChange={onFieldChange('tagsText')}
          className="border rounded px-2 py-1"
          placeholder="Comma separated tags"
          disabled={disableInputs}
        />
      </label>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Category</span>
          <input
            type="text"
            value={state.category}
            onChange={onFieldChange('category')}
            className="border rounded px-2 py-1"
            placeholder="e.g. Adventure"
            disabled={disableInputs}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Difficulty</span>
          <input
            type="text"
            value={state.difficulty}
            onChange={onFieldChange('difficulty')}
            className="border rounded px-2 py-1"
            placeholder="e.g. Beginner"
            disabled={disableInputs}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Duration (minutes)</span>
          <input
            type="number"
            value={state.duration}
            onChange={onFieldChange('duration')}
            className="border rounded px-2 py-1"
            placeholder="e.g. 45"
            disabled={disableInputs}
          />
        </label>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Center Latitude</span>
          <input
            type="number"
            value={state.centerLat}
            onChange={onFieldChange('centerLat')}
            className="border rounded px-2 py-1"
            placeholder="e.g. 44.9778"
            disabled={disableInputs}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Center Longitude</span>
          <input
            type="number"
            value={state.centerLng}
            onChange={onFieldChange('centerLng')}
            className="border rounded px-2 py-1"
            placeholder="e.g. -93.2650"
            disabled={disableInputs}
          />
        </label>
      </div>
    </div>
  );
}
