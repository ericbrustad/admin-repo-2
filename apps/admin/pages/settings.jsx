"use client";

import React, { useEffect, useState } from 'react';

import GameControlsUnified from '../components/GameControls.unified.jsx';
import RepoSnapshotFooter from '../components/RepoSnapshotFooter.jsx';

export default function SettingsPage() {
  const [headerTitle, setHeaderTitle] = useState('Esxape Ride Admin');
  const [slug, setSlug] = useState('');
  const [loggedConversation, setLoggedConversation] = useState(false);

  useEffect(() => {
    if (loggedConversation) return;
    console.log('[SettingsPage] Conversation log unavailable in this environment.');
    setLoggedConversation(true);
  }, [loggedConversation]);

  return (
    <div className="min-h-screen w-full">
      <header className="w-full sticky top-0 z-10 bg-white/70 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-baseline gap-3">
          <h1 className="text-xl font-semibold">{headerTitle}</h1>
          <span className="text-sm opacity-70">{slug}</span>
          <div className="ml-auto flex items-center gap-2" />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-5 space-y-6">
        <GameControlsUnified setHeaderTitle={setHeaderTitle} setSlug={setSlug} />
        <RepoSnapshotFooter />
      </main>
    </div>
  );
}
