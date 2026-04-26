import React, { useEffect, useRef, useState } from 'react';
import { getStatus, triggerSync } from './api';
import Setup from './pages/Setup';
import Trace from './pages/Trace';
import { DARK, LIGHT, type Theme } from './theme';

type Page = 'setup' | 'trace';
type AppState = 'loading' | 'setup' | 'ready';

function formatSyncAge(lastSync: string): string {
  const diffMs = Date.now() - new Date(lastSync).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'last sync · just now';
  if (diffMins < 60) return `last sync · ${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `last sync · ${diffHours}h ago`;
  return `last sync · ${Math.floor(diffHours / 24)}d ago`;
}

function Tab({ label, active, disabled, onClick, T }: { label: string; active: boolean; disabled?: boolean; onClick: () => void; T: Theme }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '10px 32px',
        fontSize: '0.95rem',
        fontWeight: active ? 600 : 400,
        fontFamily: 'inherit',
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
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
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
        fontFamily: 'inherit',
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
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [lastSyncSuccess, setLastSyncSuccess] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);
  const lastSyncRef = useRef<string | null>(null);

  const T = dark ? DARK : LIGHT;

  useEffect(() => {
    try { localStorage.setItem('zc-theme', dark ? 'dark' : 'light'); }
    catch { /* ignore */ }
  }, [dark]);

  useEffect(() => {
    async function checkStatus() {
      try {
        const s = await getStatus();
        if (s.lastSync && s.lastSync !== lastSyncRef.current) {
          lastSyncRef.current = s.lastSync;
          setLastSync(s.lastSync);
          setLastSyncSuccess(s.lastSyncSuccess);
        }
        return s;
      } catch { return null; }
    }

    checkStatus().then(s => {
      if (!s) { setAppState('setup'); return; }
      if (s.configured && s.authenticated) {
        setAppState('ready');
        setPage('trace');
      } else {
        setAppState('setup');
      }
    });

    const id = setInterval(checkStatus, 30_000);
    return () => clearInterval(id);
  }, []);

  async function handleSync() {
    const previousLastSync = lastSync;
    setSyncing(true);
    await triggerSync().catch(() => null);
    const poll = setInterval(async () => {
      try {
        const s = await getStatus();
        if (s.lastSync !== null && s.lastSync !== previousLastSync) {
          clearInterval(poll);
          lastSyncRef.current = s.lastSync;
          setLastSync(s.lastSync);
          setLastSyncSuccess(s.lastSyncSuccess);
          setSyncing(false);
        }
      } catch { clearInterval(poll); setSyncing(false); }
    }, 1000);
  }

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
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: "'Fira Code', monospace", transition: 'background 0.2s' }}>
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
          padding: '12px 28px 0',
          gap: 8,
        }}>
          <Tab label="Setup" active={page === 'setup'} onClick={() => setPage('setup')} T={T} />
          <Tab label="DEMO" active={page === 'trace'} disabled={!isReady} onClick={() => isReady && setPage('trace')} T={T} />
          <span style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingBottom: 10 }}>
            {/* Sync info */}
            {lastSync ? (
              <span style={{ fontSize: '0.75rem', color: T.dimmer }}>
                {formatSyncAge(lastSync)} ·{' '}
                <span style={{ color: lastSyncSuccess ? T.success : T.error, fontWeight: 500 }}>
                  {lastSyncSuccess ? '✓ success' : '✗ failed'}
                </span>
              </span>
            ) : (
              <span style={{ fontSize: '0.75rem', color: T.dimmer }}>No sync yet</span>
            )}
            <button
              onClick={handleSync}
              disabled={syncing}
              style={{
                padding: '4px 14px',
                fontSize: '0.75rem',
                fontWeight: 500,
                fontFamily: 'inherit',
                border: `1px solid ${T.border}`,
                borderRadius: 6,
                background: syncing ? T.inputBg : T.primary,
                color: syncing ? T.text : 'white',
                cursor: syncing ? 'default' : 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                whiteSpace: 'nowrap',
              }}
            >
              {syncing ? 'Syncing…' : 'Sync'}
            </button>
            <span style={{
              fontWeight: 700,
              fontSize: '1.4rem',
              letterSpacing: '-0.03em',
              color: T.navText,
              userSelect: 'none',
            }}>
              ZeroCall
            </span>
          </div>
        </div>
      </header>

      {page === 'setup' && <Setup onDone={onSetupDone} T={T} />}
      {page === 'trace' && isReady && <Trace T={T} />}

      <ThemeToggle dark={dark} onToggle={() => setDark(d => !d)} T={T} />
    </div>
  );
}
