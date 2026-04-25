import { readLatestSnapshot } from '../db/snapshot.js';
import { syncAll } from './syncAll.js';
import type { WorkStateSnapshot } from '@onecall/harness';

const DEFAULT_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Returns the cached snapshot if it exists and is younger than `maxAgeMs`.
 * Otherwise triggers a fresh sync first, then returns the new snapshot.
 *
 * This replaces the old cron-based background poller. Instead of polling on
 * a fixed interval, the server only fetches from sources when a snapshot is
 * actually requested and the cache is stale.
 */
export async function ensureFreshSnapshot(
  maxAgeMs: number = DEFAULT_MAX_AGE_MS,
): Promise<WorkStateSnapshot | null> {
  const cached = readLatestSnapshot();

  if (cached && !isStale(cached, maxAgeMs)) {
    return cached;
  }

  console.log('[cache] snapshot is %s — syncing now', cached ? 'stale' : 'empty');
  await syncAll();
  return readLatestSnapshot();
}

function isStale(snapshot: WorkStateSnapshot, maxAgeMs: number): boolean {
  const age = Date.now() - new Date(snapshot.as_of).getTime();
  return age > maxAgeMs;
}
