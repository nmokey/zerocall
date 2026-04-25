import { createRunWithOneCall } from '../../shared/runWith.js';
import { readLatestSnapshot } from '../../server/src/db/snapshot.js';

export const runWithOneCall = createRunWithOneCall(() => {
  const snapshot = readLatestSnapshot();
  if (!snapshot) throw new Error('No snapshot found. Run `npm start` first to populate the database.');
  return snapshot;
});
