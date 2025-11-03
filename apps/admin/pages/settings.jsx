import React, { useEffect, useMemo, useState } from 'react';
import GameDropdown from '../components/Settings/GameDropdown';
import GameEditor from '../components/Settings/GameEditor';
import GeoFenceManager from '../components/Settings/GeoFenceManager';
import MissionsManager from '../components/Settings/MissionsManager';
import DevicesManager from '../components/Settings/DevicesManager';
import PublishControls from '../components/Settings/PublishControls';
import RepoSnapshotFooter from '../components/RepoSnapshotFooter';
import { browserClient } from '../lib/supabaseClient';

const styles = {
  page: {
    maxWidth: 960,
    margin: '0 auto',
    padding: '32px 24px 80px',
    display: 'grid',
    gap: 24,
    color: 'var(--admin-body-color)',
  },
  intro: {
    fontSize: 14,
    lineHeight: 1.6,
    color: 'var(--admin-muted)',
  },
  sectionStack: {
    display: 'grid',
    gap: 24,
  },
  notice: {
    fontSize: 13,
    padding: '12px 14px',
    borderRadius: 10,
    border: '1px solid var(--admin-border-soft)',
    background: 'rgba(148, 163, 184, 0.08)',
    color: 'var(--admin-muted)',
  },
};

function normalizeGame(game) {
  if (!game) return null;
  const id = game.id || `draft-${Date.now()}`;
  const missions = Array.isArray(game.missions) ? game.missions : [];
  const devices = Array.isArray(game.devices) ? game.devices : [];
  const geo = game.geo && typeof game.geo === 'object'
    ? { lat: Number(game.geo.lat) || 0, lng: Number(game.geo.lng) || 0 }
    : { lat: 0, lng: 0 };
  return {
    ...game,
    id,
    missions,
    devices,
    geo,
  };
}

function loadDraftsFromStorage() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem('draftGames');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeGame).filter(Boolean);
  } catch (error) {
    console.warn('Failed to load draft games from storage', error);
    return [];
  }
}

export default function SettingsPage() {
  const [games, setGames] = useState(() => loadDraftsFromStorage());
  const [selectedGame, setSelectedGame] = useState(null);
  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    try {
      return browserClient();
    } catch (error) {
      console.warn('Supabase client unavailable', error);
      return null;
    }
  }, []);

  useEffect(() => {
    const storedGames = loadDraftsFromStorage();
    if (storedGames.length) {
      setGames(storedGames);
      setSelectedGame(storedGames[0]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('draftGames', JSON.stringify(games));
    } catch (error) {
      console.warn('Unable to persist draft games', error);
    }
  }, [games]);

  const sortedGames = useMemo(() => {
    return [...games].sort((a, b) => {
      const titleA = (a?.title || a?.name || '').toLowerCase();
      const titleB = (b?.title || b?.name || '').toLowerCase();
      return titleA.localeCompare(titleB);
    });
  }, [games]);

  const handleSelect = (gameId) => {
    if (!gameId) {
      setSelectedGame(null);
      return;
    }
    const match = games.find((game) => String(game.id) === String(gameId))
      || games.find((game) => String(game.slug) === String(gameId));
    setSelectedGame(match ? normalizeGame(match) : null);
  };

  const saveDraft = (game) => {
    const normalized = normalizeGame(game || {});
    if (!normalized) return;
    setGames((prev) => {
      const exists = prev.some((item) => String(item.id) === String(normalized.id));
      const next = exists
        ? prev.map((item) => (String(item.id) === String(normalized.id) ? normalized : item))
        : [...prev, normalized];
      return next;
    });
    setSelectedGame(normalized);
    window.alert('Draft saved locally.');
  };

  const publishGame = async (game) => {
    if (!game) return;
    if (!supabase) {
      window.alert('Supabase client is not configured. Skipping publish.');
      return;
    }
    const payload = { ...game };
    const response = await supabase.from('games').upsert(payload);
    if (response?.error) {
      window.alert(`Failed to publish game: ${response.error.message}`);
      return;
    }
    window.alert('Game published successfully.');
  };

  const deleteGame = async (id) => {
    if (!id) return;
    setGames((prev) => prev.filter((game) => String(game.id) !== String(id)));
    setSelectedGame((prev) => (prev && String(prev.id) === String(id) ? null : prev));
    if (supabase) {
      const { error } = await supabase.from('games').delete().eq('id', id);
      if (error) {
        window.alert(`Failed to delete game remotely: ${error.message}`);
        return;
      }
    }
    window.alert('Game deleted.');
  };

  return (
    <div style={styles.page}>
      <header>
        <h1>Game Settings</h1>
        <p style={styles.intro}>
          Manage draft games locally, adjust mission, device, and location settings, then publish to Supabase when
          you are ready.
        </p>
      </header>

      <GameDropdown games={sortedGames} selectedId={selectedGame?.id || ''} onSelect={handleSelect} />

      {!games.length && (
        <div style={styles.notice}>
          No local drafts found. Save a draft in the editor to begin.
        </div>
      )}

      {selectedGame && (
        <div style={styles.sectionStack}>
          <GameEditor game={selectedGame} onSave={saveDraft} />
          <GeoFenceManager game={selectedGame} onSave={saveDraft} />
          <MissionsManager game={selectedGame} onSave={saveDraft} />
          <DevicesManager game={selectedGame} onSave={saveDraft} />
          <PublishControls game={selectedGame} onPublish={publishGame} onDelete={deleteGame} />
        </div>
      )}

      <RepoSnapshotFooter />
    </div>
  );
}
