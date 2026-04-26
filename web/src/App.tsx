import React, { useEffect, useState } from 'react';
import { getStatus } from './api';
import Setup from './pages/Setup';
import Trace from './pages/Trace';
import { DARK, LIGHT, type Theme } from './theme';

type Page = 'setup' | 'trace';
type AppState = 'loading' | 'setup' | 'ready';

function Tab({ label, active, disabled, onClick, T }: { label: string; active: boolean; disabled?: boolean; onClick: () => void; T: Theme }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '10px 32px',
        fontSize: '0.95rem',
        fontWeight: active ? 600 : 400,
        color: active ? T.text : disabled ? T.dimmer : T.muted,
        background: active ? T.bg : T.cardHead,
        border: `1.5px solid ${T.border}`,
        borderBottom: active ? `1.5px solid ${T.bg}` : `1.5px solid ${T.border}`,
        borderRadius: '8px 8px 0 0',
        cursor: disabled ? 'default' : 'pointer',
        marginBottom: '-1.5px',
        position: 'relative',
        zIndex: active ? 1 : 0,
        transition: 'color 0.15s',
        whiteSpace: 'nowrap',
      }}
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
      .catch(() => setAppState('setup'));
  }, []);

  if (appState === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: T.bg, color: T.muted, fontSize: '0.9rem' }}>
        Loading…
      </div>
    );
  }

  const isReady = appState === 'ready';

  function onSetupDone() {
    setAppState('ready');
    setPage('trace');
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", transition: 'background 0.2s' }}>
      <header style={{
        background: T.navBg,
        borderBottom: `1.5px solid ${T.navBorder}`,
        position: 'sticky',
        top: 0,
        zIndex: 10,
        transition: 'background 0.2s, border-color 0.2s',
      }}>
        {/* Tab strip + branding in one row */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-end',
          padding: '20px 28px 0',
          gap: 8,
        }}>
          <Tab label="Setup" active={page === 'setup'} onClick={() => setPage('setup')} T={T} />
          <Tab label="Trace" active={page === 'trace'} disabled={!isReady} onClick={() => isReady && setPage('trace')} T={T} />
          <span style={{ flex: 1 }} />
          <span style={{
            fontWeight: 700,
            fontSize: '1.4rem',
            letterSpacing: '-0.03em',
            color: T.navText,
            paddingBottom: 10,
            userSelect: 'none',
          }}>
            ZeroCall
          </span>
        </div>
      </header>

      {page === 'setup' && <Setup onDone={onSetupDone} T={T} />}
      {page === 'trace' && isReady && <Trace T={T} />}

      <ThemeToggle dark={dark} onToggle={() => setDark(d => !d)} T={T} />
    </div>
  );
}
