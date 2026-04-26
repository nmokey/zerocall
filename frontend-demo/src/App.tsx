import React, { useEffect, useRef, useState } from 'react';
import { getStatus, triggerSync } from './api';
import Setup from './pages/Setup';
import Trace from './pages/Trace';
import styles from './App.module.css';
import logoSrc from './assets/zerocall_logo.png';
import darkLogoSrc from './assets/dark_logo.png';

type Page = 'setup' | 'trace';
type AppState = 'loading' | 'setup' | 'ready';

function formatSyncAge(lastSync: string): string {
  const diffMs = Date.now() - new Date(lastSync).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'last sync \u00b7 just now';
  if (diffMins < 60) return `last sync \u00b7 ${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `last sync \u00b7 ${diffHours}h ago`;
  return `last sync \u00b7 ${Math.floor(diffHours / 24)}d ago`;
}

function Tab({ label, active, disabled, onClick }: { label: string; active: boolean; disabled?: boolean; onClick: () => void }) {
  const cls = [styles.tab, active ? styles.active : '', disabled ? styles.disabled : ''].filter(Boolean).join(' ');
  return (
    <button onClick={onClick} disabled={disabled} className={cls}>
      {label}
    </button>
  );
}

function ThemeToggle({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={styles.themeToggle}
    >
      {dark ? '\u2600' : '\u263E'}
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

  useEffect(() => {
    try { localStorage.setItem('zc-theme', dark ? 'dark' : 'light'); }
    catch { /* ignore */ }
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }, []);

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
    return <div className={styles.loading}>Loading&hellip;</div>;
  }

  const isReady = appState === 'ready';

  function onSetupDone() {
    setAppState('ready');
    setPage('trace');
  }

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.tabStrip}>
          <Tab label="Setup" active={page === 'setup'} onClick={() => setPage('setup')} />
          <Tab label="DEMO" active={page === 'trace'} disabled={!isReady} onClick={() => isReady && setPage('trace')} />
          <span className={styles.spacer} />
          <div className={styles.headerRight}>
            {lastSync ? (
              <span className={styles.syncAge}>
                {formatSyncAge(lastSync)} &middot;{' '}
                <span className={lastSyncSuccess ? styles.syncSuccess : styles.syncFailed}>
                  {lastSyncSuccess ? '\u2713 success' : '\u2717 failed'}
                </span>
              </span>
            ) : (
              <span className={styles.syncAge}>No sync yet</span>
            )}
            <button onClick={handleSync} disabled={syncing} className={styles.syncButton}>
              {syncing ? 'Syncing\u2026' : 'Sync'}
            </button>
            <img src={dark ? darkLogoSrc : logoSrc} alt="ZeroCall" className={dark ? styles.brandingDark : styles.branding} />
          </div>
        </div>
      </header>

      {page === 'setup' && <Setup onDone={onSetupDone} />}
      {page === 'trace' && isReady && <Trace />}

      <ThemeToggle dark={dark} onToggle={() => setDark(d => !d)} />
    </div>
  );
}
