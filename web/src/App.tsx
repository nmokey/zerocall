import React, { useEffect, useState } from 'react';
import { getStatus } from './api';
import Setup from './pages/Setup';
import Trace from './pages/Trace';
import { useTheme } from './theme';

type Page = 'setup' | 'trace';
type AppState = 'loading' | 'setup' | 'ready';

function NavLink({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  const { T } = useTheme();
  return (
    <button
      onClick={onClick}
      style={{
        border: 'none',
        cursor: 'pointer',
        fontSize: '0.85rem',
        fontWeight: active ? 600 : 400,
        color: active ? T.primary : T.muted,
        padding: '4px 10px',
        borderRadius: '5px',
        background: active ? T.card : 'none',
        textDecoration: 'none',
      } as React.CSSProperties}
    >
      {label}
    </button>
  );
}

export default function App() {
  const { T } = useTheme();
  const [appState, setAppState] = useState<AppState>('loading');
  const [page, setPage] = useState<Page>('setup');

  useEffect(() => {
    getStatus()
      .then(s => {
        setAppState(s.configured && s.authenticated ? 'ready' : 'setup');
      })
      .catch(() => {
        setAppState('setup');
      });
  }, []);

  if (appState === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: T.bg, color: T.muted, fontSize: '0.9rem', transition: 'background 0.3s, color 0.3s' }}>
        Loading\u2026
      </div>
    );
  }

  function onSetupDone() {
    setAppState('ready');
    setPage('trace');
  }

  const isReady = appState === 'ready';

  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", transition: 'background 0.3s' }}>
      <nav style={{
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
        padding: '12px 32px',
        background: T.cardHead,
        borderBottom: `1.5px solid ${T.border}`,
        position: 'sticky' as const,
        top: 0,
        zIndex: 10,
        transition: 'background 0.3s, border-color 0.3s',
      }}>
        <span style={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '-0.02em', color: T.text, flex: 1, transition: 'color 0.3s' }}>ZeroCall</span>
        <NavLink label="Setup" active={page === 'setup'} onClick={() => setPage('setup')} />
        {isReady && <NavLink label="Trace" active={page === 'trace'} onClick={() => setPage('trace')} />}
      </nav>

      {page === 'setup' && <Setup onDone={onSetupDone} />}
      {page === 'trace' && isReady && <Trace />}
    </div>
  );
}
