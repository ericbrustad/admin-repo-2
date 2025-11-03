import React from 'react';

const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--admin-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  select: {
    padding: '12px 14px',
    borderRadius: 10,
    border: '1px solid var(--admin-border-soft)',
    background: 'var(--appearance-panel-bg, rgba(15, 23, 42, 0.24))',
    color: 'var(--appearance-font-color, var(--admin-body-color))',
    fontSize: 14,
    fontWeight: 500,
  },
};

export default function GameDropdown({ games, selectedId, onSelect }) {
  const handleChange = (event) => {
    const value = event?.target?.value || '';
    if (onSelect) onSelect(value);
  };

  return (
    <div style={styles.wrapper}>
      <label style={styles.label} htmlFor="game-settings-dropdown">
        Saved Drafts
      </label>
      <select
        id="game-settings-dropdown"
        style={styles.select}
        onChange={handleChange}
        value={selectedId || ''}
      >
        <option value="">Select a game</option>
        {games.map((game) => {
          const value = String(game.id || game.slug || '');
          const title = game.title || game.name || value || 'Untitled';
          return (
            <option key={value || title} value={value}>
              {title}
            </option>
          );
        })}
      </select>
    </div>
  );
}
