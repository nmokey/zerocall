import { useEffect, useState } from 'react';
import { getStatus } from './api';
import Setup from './pages/Setup';
import Dashboard from './pages/Dashboard';

type AppState = 'loading' | 'setup' | 'ready';

export default function App() {
  const [state, setState] = useState<AppState>('loading');

  useEffect(() => {
    getStatus()
      .then(s => setState(s.configured && s.authenticated ? 'ready' : 'setup'))
      .catch(() => setState('setup'));
  }, []);

  if (state === 'loading') return null;
  if (state === 'setup') return <Setup onComplete={() => setState('ready')} />;
  return <Dashboard />;
}
