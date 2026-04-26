import React, { useEffect, useState } from 'react';
import { getStatus } from './api';
import Setup from './pages/Setup';
import Trace from './pages/Trace';

type Page = 'setup' | 'trace';
type AppState = 'loading' | 'setup' | 'ready';

const NAV: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '20px',
  padding: '12px 32px',
  background: '#e4dfd2',
  borderBottom: '1.5px solid #c4bab0',
  position: 'sticky' as const,
  top: 0,
  zIndex: 10,
};

const NAV_TITLE: React.CSSProperties = {
  fontWeight: 700,
  fontSize: '1rem',
  letterSpacing: '-0.02em',
  color: '#2a2218',
  flex: 1,
};

function NavLink({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: 'none',
        cursor: 'pointer',
        fontSize: '0.85rem',
        fontWeight: active ? 600 : 400,
        color: active ? '#c05a2b' : '#7a7060',
        padding: '4px 10px',
        borderRadius: '5px',
        background: active ? '#f5ede4' : 'none',
        textDecoration: 'none',
      } as React.CSSProperties}
    >
      {label}
    </button>
  );
}

export default function App() {
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#ece8dc', color: '#7a7060', fontSize: '0.9rem' }}>
        Loading…
      </div>
    );
  }

  function onSetupDone() {
    setAppState('ready');
    setPage('trace');
  }

  const isReady = appState === 'ready';

  return (
    <div style={{ minHeight: '100vh', background: '#ece8dc', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <nav style={NAV}>
        <span style={NAV_TITLE}>OneCall</span>
        <NavLink label="Setup" active={page === 'setup'} onClick={() => setPage('setup')} />
        {isReady && <NavLink label="Trace" active={page === 'trace'} onClick={() => setPage('trace')} />}
      </nav>

      {page === 'setup' && <Setup onDone={onSetupDone} />}
      {page === 'trace' && isReady && <Trace />}
    </div>
  );
}
