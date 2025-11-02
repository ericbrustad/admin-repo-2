// CODEx SHIM — Legacy entry point for Game Controls
// This keeps existing imports alive while the CodexDrop panel handles the
// unified Saved Games dropdown, local draft storage, and publish/draft flows.
// New code should import from './CodexDrop.GameDraftsPanel.jsx' directly, but
// older modules (and downstream apps) can continue referencing this file.

import CodexDropGameDraftsPanel, {
  CloseAndSaveSettings,
  useCodexGames,
} from './CodexDrop.GameDraftsPanel.jsx';

export default CodexDropGameDraftsPanel;
export { CloseAndSaveSettings, useCodexGames };
// Backwards-compatible alias so legacy code expecting `useGames` continues to work.
export const useGames = useCodexGames;
