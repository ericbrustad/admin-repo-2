import React, { useEffect, useState } from 'react';
import CoverUploader from './CoverUploader';

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
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: 600,
  },
  inputs: {
    display: 'grid',
    gap: 12,
  },
  input: {
    padding: '12px 14px',
    borderRadius: 10,
    border: '1px solid var(--admin-border-soft)',
    background: 'rgba(255, 255, 255, 0.04)',
    color: 'var(--appearance-font-color, var(--admin-body-color))',
    fontSize: 14,
  },
  saveButton: {
    alignSelf: 'flex-start',
    padding: '10px 18px',
    borderRadius: 999,
    border: 'none',
    background: 'var(--admin-button-bg, #2563eb)',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
  },
  footer: {
    fontSize: 12,
    color: 'var(--admin-muted)',
  },
};

export default function GameEditor({ game, onSave }) {
  const [data, setData] = useState(() => ({ ...game }));

  useEffect(() => {
    setData({ ...game });
  }, [game]);

  const handleChange = (field, value) => {
    setData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    if (onSave) onSave(data);
  };

  return (
    <section style={styles.panel}>
      <div style={styles.header}>
        <h2 style={styles.title}>Game Details</h2>
        {data?.id && <span style={styles.footer}>ID: {data.id}</span>}
      </div>

      <div style={styles.inputs}>
        <input
          style={styles.input}
          type="text"
          placeholder="Title"
          value={data.title || ''}
          onChange={(event) => handleChange('title', event.target.value)}
        />
        <input
          style={styles.input}
          type="text"
          placeholder="Name"
          value={data.name || ''}
          onChange={(event) => handleChange('name', event.target.value)}
        />
      </div>

      <CoverUploader
        coverImage={data.coverImage}
        onChange={(url) => handleChange('coverImage', url)}
      />

      <button type="button" style={styles.saveButton} onClick={handleSave}>
        Save Draft
      </button>
    </section>
  );
}
