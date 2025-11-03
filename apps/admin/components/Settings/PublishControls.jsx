import React from 'react';

const styles = {
  wrapper: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
  },
  button: {
    padding: '10px 18px',
    borderRadius: 999,
    border: 'none',
    fontWeight: 600,
    cursor: 'pointer',
  },
  publish: {
    background: 'var(--admin-button-bg, #2563eb)',
    color: '#fff',
  },
  delete: {
    background: 'rgba(239, 68, 68, 0.12)',
    color: '#ef4444',
  },
};

export default function PublishControls({ game, onPublish, onDelete }) {
  const handlePublish = () => {
    if (onPublish) onPublish(game);
  };

  const handleDelete = () => {
    if (game?.id && onDelete) onDelete(game.id);
  };

  return (
    <div style={styles.wrapper}>
      <button type="button" style={{ ...styles.button, ...styles.publish }} onClick={handlePublish}>
        Publish
      </button>
      <button type="button" style={{ ...styles.button, ...styles.delete }} onClick={handleDelete}>
        Delete
      </button>
    </div>
  );
}
