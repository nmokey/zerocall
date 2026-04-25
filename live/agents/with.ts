import { createRunWithOneCall } from '../../shared/runWith.js';
import { ensureFreshSnapshot } from '../../server/src/sync/scheduler.js';

export const runWithOneCall = createRunWithOneCall(() => ensureFreshSnapshot());
