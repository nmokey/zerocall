import cron from 'node-cron';
import { syncAll } from './syncAll.js';

export function startScheduler(): void {
  const intervalMinutes = parseInt(process.env.SYNC_INTERVAL_MINUTES ?? '15', 10);
  const cronExpr = `*/${intervalMinutes} * * * *`;

  cron.schedule(cronExpr, () => {
    syncAll().catch(err => console.error('[scheduler] sync error:', err));
  });

  console.log(`[scheduler] polling every ${intervalMinutes} minutes`);

  // Run immediately on startup
  syncAll().catch(err => console.error('[scheduler] initial sync error:', err));
}
