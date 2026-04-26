import React, { useEffect, useState } from 'react';
import { getStatus } from './api';
import Setup from './pages/Setup';
import Trace from './pages/Trace';
import { DARK, LIGHT, type Theme } from './theme';

type Page = 'setup' | 'trace';
type AppState = 'loading' | 'setup' | 'ready';

function NavLink({ label, active, onClick, T }: { label: string; active: boolean; onClick: () => void; T: Theme }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: 'none',
        cursor: 'pointer',
        fontSize: '0.85rem',
        fontWeight: active ? 600 : 400,
        color: active ? T.navActiveText : T.navInactiveText,
        padding: '4px 10px',
        borderRadius: '5px',
        background: active ? T.navActiveBg : 'none',
        textDecoration: 'none',
        transition: 'color 0.15s, background 0.15s',
      } as React.CSSProperties}
    >
      {label}
    </button>
  );
}

function ThemeToggle({ dark, onToggle, T }: { dark: boolean; onToggle: () => void; T: Theme }) {
  return (
    <button
      onClick={onToggle}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        position: 'fixed',
        bottom: 20,
        left: 20,
        zIndex: 200,
        width: 40,
        height: 40,
        borderRadius: '50%',
        border: `1.5px solid ${T.border}`,
        background: T.toggleBg,
        color: T.toggleFg,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '1.1rem',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        transition: 'background 0.2s, border-color 0.2s',
      }}
    >
      {dark ? '☀' : '☾'}
    </button>
  );
}

export default function App() {
  const [appState, setAppState] = useState<AppState>('loading');
  const [page, setPage] = useState<Page>('setup');
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('zc-theme') === 'dark'; }
    catch { return false; }
  });

  const T = dark ? DARK : LIGHT;

  useEffect(() => {
    try { localStorage.setItem('zc-theme', dark ? 'dark' : 'light'); }
    catch { /* ignore */ }
  }, [dark]);

  useEffect(() => {
    getStatus()
      .then(s => {
        if (s.configured && s.authenticated) {
          setAppState('ready');
          setPage('trace');
        } else {
          setAppState('setup');
        }
      })
      .catch(() => {
        setAppState('setup');
      });
  }, []);

  if (appState === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: T.bg, color: T.muted, fontSize: '0.9rem' }}>
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
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", transition: 'background 0.2s' }}>
      <nav style={{
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
        padding: '12px 32px',
        background: T.navBg,
        borderBottom: `1.5px solid ${T.navBorder}`,
        position: 'sticky',
        top: 0,
        zIndex: 10,
        transition: 'background 0.2s, border-color 0.2s',
      }}>
        <span style={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '-0.02em', color: T.navText, flex: 1 }}>
          ZeroCall
        </span>
        <NavLink label="Setup" active={page === 'setup'} onClick={() => setPage('setup')} T={T} />
        {isReady && <NavLink label="Trace" active={page === 'trace'} onClick={() => setPage('trace')} T={T} />}
      </nav>

      {page === 'setup' && <Setup onDone={onSetupDone} T={T} />}
      {page === 'trace' && isReady && <Trace T={T} />}

      <ThemeToggle dark={dark} onToggle={() => setDark(d => !d)} T={T} />
    </div>
  );
}
