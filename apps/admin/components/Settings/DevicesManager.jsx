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

function createDeviceId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `device-${Date.now()}`;
}

export default function DevicesManager({ game, onSave }) {
  const [devices, setDevices] = useState(() => (Array.isArray(game?.devices) ? game.devices : []));
  const [newDevice, setNewDevice] = useState({ name: '', type: '' });

  useEffect(() => {
    setDevices(Array.isArray(game?.devices) ? game.devices : []);
    setNewDevice({ name: '', type: '' });
  }, [game]);

  const hasDevices = useMemo(() => devices.length > 0, [devices]);

  const addDevice = () => {
    if (!newDevice.name?.trim()) {
      window.alert('Device name is required.');
      return;
    }
    const device = {
      id: createDeviceId(),
      name: newDevice.name.trim(),
      type: newDevice.type.trim(),
    };
    const updated = [...devices, device];
    setDevices(updated);
    setNewDevice({ name: '', type: '' });
    if (onSave) onSave({ ...game, devices: updated });
  };

  const deleteDevice = (deviceId) => {
    const updated = devices.filter((device) => String(device.id) !== String(deviceId));
    setDevices(updated);
    if (onSave) onSave({ ...game, devices: updated });
  };

  return (
    <section style={styles.panel}>
      <h2 style={styles.header}>Devices</h2>
      {hasDevices ? (
        <ul style={styles.list}>
          {devices.map((device) => (
            <li key={device.id} style={styles.listItem}>
              <div style={styles.itemContent}>
                <span style={styles.itemTitle}>{device.name}</span>
                {device.type && <span style={styles.itemDescription}>{device.type}</span>}
              </div>
              <button
                type="button"
                style={styles.deleteButton}
                onClick={() => deleteDevice(device.id)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div style={styles.itemDescription}>No devices yet. Add one below.</div>
      )}

      <div style={styles.form}>
        <input
          style={styles.input}
          type="text"
          placeholder="Device name"
          value={newDevice.name}
          onChange={(event) => setNewDevice((prev) => ({ ...prev, name: event.target.value }))}
        />
        <input
          style={styles.input}
          type="text"
          placeholder="Device type"
          value={newDevice.type}
          onChange={(event) => setNewDevice((prev) => ({ ...prev, type: event.target.value }))}
        />
        <button type="button" style={styles.addButton} onClick={addDevice}>
          Add Device
        </button>
      </div>
    </section>
  );
}
