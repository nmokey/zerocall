import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

// ─── Token shape ────────────────────────────────────────────────────────────

export interface ThemeTokens {
  bg: string;
  card: string;
  cardHead: string;
  border: string;
  primary: string;
  primaryHover: string;
  text: string;
  muted: string;
  dimmer: string;
  label: string;
  inputBg: string;
  lockedBg: string;
  lockedText: string;
  success: string;
  error: string;
  successBg: string;
  successBorder: string;
  errorBg: string;
  errorBorder: string;
  withoutAccent: string;
  withAccent: string;
}

// ─── Palettes ───────────────────────────────────────────────────────────────

export const LIGHT: ThemeTokens = {
  bg: '#ece8dc',
  card: '#f0ece2',
  cardHead: '#e4dfd2',
  border: '#c4bab0',
  primary: '#c05a2b',
  primaryHover: '#a84c23',
  text: '#2a2218',
  muted: '#7a7060',
  dimmer: '#8a7e70',
  label: '#524838',
  inputBg: '#ffffff',
  lockedBg: '#e8e4d8',
  lockedText: '#7a7060',
  success: '#2e7d4f',
  error: '#b53030',
  successBg: '#e6f4ea',
  successBorder: '#9dceab',
  errorBg: '#fdf0f0',
  errorBorder: '#efb8b8',
  withoutAccent: '#b53030',
  withAccent: '#2e7d4f',
};

export const DARK: ThemeTokens = {
  bg: '#1a1816',
  card: '#242220',
  cardHead: '#2c2a26',
  border: '#3e3930',
  primary: '#d4764e',
  primaryHover: '#e08558',
  text: '#e6e0d4',
  muted: '#9a9080',
  dimmer: '#807668',
  label: '#b8a890',
  inputBg: '#2a2720',
  lockedBg: '#302d28',
  lockedText: '#807668',
  success: '#4caa70',
  error: '#d44444',
  successBg: '#1a2e22',
  successBorder: '#3a6b48',
  errorBg: '#2e1c1c',
  errorBorder: '#6b3a3a',
  withoutAccent: '#d44444',
  withAccent: '#4caa70',
};

// ─── Context ────────────────────────────────────────────────────────────────

type Mode = 'light' | 'dark';

interface ThemeCtx {
  mode: Mode;
  T: ThemeTokens;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeCtx>({
  mode: 'light',
  T: LIGHT,
  toggle: () => {},
});

const STORAGE_KEY = 'onecall-theme';

function readStored(): Mode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'dark' || v === 'light') return v;
  } catch { /* SSR / private browsing */ }
  return 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>(readStored);

  const toggle = useCallback(() => {
    setMode(prev => {
      const next = prev === 'light' ? 'dark' : 'light';
      try { localStorage.setItem(STORAGE_KEY, next); } catch { /* noop */ }
      return next;
    });
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode);
  }, [mode]);

  const T = mode === 'light' ? LIGHT : DARK;

  return (
    <ThemeContext.Provider value={{ mode, T, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeCtx {
  return useContext(ThemeContext);
}

// ─── Toggle button ──────────────────────────────────────────────────────────

export function ThemeToggle({ size = 28 }: { size?: number }) {
  const { mode, T, toggle } = useTheme();
  const isDark = mode === 'dark';

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        border: `1.5px solid ${T.border}`,
        borderRadius: '50%',
        background: T.cardHead,
        cursor: 'pointer',
        padding: 0,
        color: T.dimmer,
        fontSize: size * 0.5,
        lineHeight: 1,
        transition: 'background 0.2s, border-color 0.2s, color 0.2s',
        flexShrink: 0,
      }}
    >
      {isDark ? '\u2600' : '\u263E'}
    </button>
  );
}
