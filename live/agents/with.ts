import { createRunWithOneCall } from '../../shared/runWith.js';
import { ensureFreshSnapshot } from '../../server/src/sync/scheduler.js';
import { logQuery } from '../../server/src/db/queryLog.js';
import { readAdaptiveConfig } from '../../server/src/db/adaptiveConfig.js';

export const runWithOneCall = createRunWithOneCall(
  () => ensureFreshSnapshot(),
  { queryLogger: logQuery, configGetter: readAdaptiveConfig },
);
