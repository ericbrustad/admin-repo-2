import React, { useEffect, useMemo, useState } from 'react';

const styles = {
  panel: {
    padding: '20px 22px',
    borderRadius: 14,
    border: '1px solid var(--admin-border-soft)',
    background: 'var(--appearance-panel-bg, rgba(15, 23, 42, 0.32))',
    display: 'grid',
    gap: 16,
  },
  header: {
    fontSize: 16,
    fontWeight: 600,
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gap: 10,
  },
  listItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid var(--admin-border-soft)',
    background: 'rgba(255, 255, 255, 0.04)',
    gap: 16,
  },
  itemContent: {
    display: 'grid',
    gap: 4,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: 600,
  },
  itemDescription: {
    fontSize: 12,
    color: 'var(--admin-muted)',
  },
  deleteButton: {
    background: 'rgba(239, 68, 68, 0.12)',
    color: '#ef4444',
    border: 'none',
    borderRadius: 999,
    padding: '8px 14px',
    cursor: 'pointer',
    fontWeight: 600,
  },
  form: {
    display: 'grid',
    gap: 12,
  },
  input: {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid var(--admin-border-soft)',
    background: 'rgba(255, 255, 255, 0.04)',
    color: 'var(--appearance-font-color, var(--admin-body-color))',
    fontSize: 13,
  },
  addButton: {
    alignSelf: 'flex-start',
    padding: '10px 18px',
    borderRadius: 999,
    border: 'none',
    background: 'var(--admin-button-bg, #2563eb)',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
  },
};

function createMissionId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `mission-${Date.now()}`;
}

export default function MissionsManager({ game, onSave }) {
  const [missions, setMissions] = useState(() => (Array.isArray(game?.missions) ? game.missions : []));
  const [newMission, setNewMission] = useState({ title: '', description: '' });

  useEffect(() => {
    setMissions(Array.isArray(game?.missions) ? game.missions : []);
    setNewMission({ title: '', description: '' });
  }, [game]);

  const hasMissions = useMemo(() => missions.length > 0, [missions]);

  const addMission = () => {
    if (!newMission.title?.trim()) {
      window.alert('Mission title is required.');
      return;
    }
    const mission = {
      id: createMissionId(),
      title: newMission.title.trim(),
      description: newMission.description.trim(),
    };
    const updated = [...missions, mission];
    setMissions(updated);
    setNewMission({ title: '', description: '' });
    if (onSave) onSave({ ...game, missions: updated });
  };

  const deleteMission = (missionId) => {
    const updated = missions.filter((mission) => String(mission.id) !== String(missionId));
    setMissions(updated);
    if (onSave) onSave({ ...game, missions: updated });
  };

  return (
    <section style={styles.panel}>
      <h2 style={styles.header}>Missions</h2>
      {hasMissions ? (
        <ul style={styles.list}>
          {missions.map((mission) => (
            <li key={mission.id} style={styles.listItem}>
              <div style={styles.itemContent}>
                <span style={styles.itemTitle}>{mission.title}</span>
                {mission.description && <span style={styles.itemDescription}>{mission.description}</span>}
              </div>
              <button
                type="button"
                style={styles.deleteButton}
                onClick={() => deleteMission(mission.id)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div style={styles.itemDescription}>No missions yet. Add one below.</div>
      )}

      <div style={styles.form}>
        <input
          style={styles.input}
          type="text"
          placeholder="Mission title"
          value={newMission.title}
          onChange={(event) => setNewMission((prev) => ({ ...prev, title: event.target.value }))}
        />
        <input
          style={styles.input}
          type="text"
          placeholder="Mission description"
          value={newMission.description}
          onChange={(event) => setNewMission((prev) => ({ ...prev, description: event.target.value }))}
        />
        <button type="button" style={styles.addButton} onClick={addMission}>
          Add Mission
        </button>
      </div>
    </section>
  );
}
