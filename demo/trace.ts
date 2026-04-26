import 'dotenv/config';
import { runTrace } from '../shared/trace.js';
import { runWithoutZeroCall } from './agents/without.js';
import { runWithZeroCall } from './agents/with.js';

runTrace('ZeroCall Trace Demo', { runWithoutZeroCall, runWithZeroCall })
  .catch(err => { console.error(err); process.exit(1); });
