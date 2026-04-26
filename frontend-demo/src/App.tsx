import React, { useEffect, useState } from 'react';
import { getStatus } from './api';
import Setup from './pages/Setup';
import Trace from './pages/Trace';
import styles from './App.module.css';

type Page = 'setup' | 'trace';
type AppState = 'loading' | 'setup' | 'ready';

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

  useEffect(() => {
    try { localStorage.setItem('zc-theme', dark ? 'dark' : 'light'); }
    catch { /* ignore */ }
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }, []);

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
          <span className={styles.branding}>ZeroCall</span>
        </div>
      </header>

      {page === 'setup' && <Setup onDone={onSetupDone} />}
      {page === 'trace' && isReady && <Trace />}

      <ThemeToggle dark={dark} onToggle={() => setDark(d => !d)} />
    </div>
  );
}
