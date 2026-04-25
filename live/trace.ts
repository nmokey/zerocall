import 'dotenv/config';
import { runTrace } from '../shared/trace.js';
import { runWithoutOneCall } from './agents/without.js';
import { runWithOneCall } from './agents/with.js';

runTrace('OneCall Live Trace', { runWithoutOneCall, runWithOneCall })
  .catch(err => { console.error(err); process.exit(1); });
