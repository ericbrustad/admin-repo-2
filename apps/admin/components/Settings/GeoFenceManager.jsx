import React, { useEffect, useState } from 'react';

const styles = {
  panel: {
    padding: '20px 22px',
    borderRadius: 14,
    border: '1px solid var(--admin-border-soft)',
    background: 'var(--appearance-panel-bg, rgba(15, 23, 42, 0.32))',
    display: 'grid',
    gap: 12,
  },
  header: {
    fontSize: 16,
    fontWeight: 600,
  },
  inputRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
  },
  input: {
    flex: 1,
    minWidth: 240,
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid var(--admin-border-soft)',
    background: 'rgba(255, 255, 255, 0.04)',
    color: 'var(--appearance-font-color, var(--admin-body-color))',
  },
  button: {
    padding: '10px 18px',
    borderRadius: 999,
    border: 'none',
    background: 'var(--admin-button-bg, #2563eb)',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
  },
  hint: {
    fontSize: 12,
    color: 'var(--admin-muted)',
  },
};

export default function GeoFenceManager({ game, onSave }) {
  const [address, setAddress] = useState(game?.geoAddress || '');

  useEffect(() => {
    setAddress(game?.geoAddress || '');
  }, [game]);

  const handleSearch = () => {
    const currentGeo = game?.geo || { lat: 0, lng: 0 };
    const fallbackCenter = { lat: Number(currentGeo.lat) || 37.7749, lng: Number(currentGeo.lng) || -122.4194 };
    const newCenter = {
      lat: fallbackCenter.lat,
      lng: fallbackCenter.lng,
    };

    const missions = Array.isArray(game?.missions) ? game.missions : [];
    const updatedPins = missions.map((pin) => {
      const pinLat = Number(pin?.lat) || 0;
      const pinLng = Number(pin?.lng) || 0;
      const baseLat = Number(currentGeo.lat) || 0;
      const baseLng = Number(currentGeo.lng) || 0;
      return {
        ...pin,
        lat: newCenter.lat + (pinLat - baseLat),
        lng: newCenter.lng + (pinLng - baseLng),
      };
    });

    const updated = {
      ...game,
      geo: newCenter,
      geoAddress: address,
      missions: updatedPins,
    };

    if (onSave) onSave(updated);
    window.alert('Location updated and mission pins repositioned.');
  };

  return (
    <section style={styles.panel}>
      <h2 style={styles.header}>Geo Fence</h2>
      <div style={styles.inputRow}>
        <input
          style={styles.input}
          type="text"
          placeholder="Search address"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
        />
        <button type="button" style={styles.button} onClick={handleSearch}>
          Update Location
        </button>
      </div>
      <div style={styles.hint}>
        Integrate Mapbox or Google geocoding to replace the placeholder search and update coordinates.
      </div>
    </section>
  );
}
