import 'dotenv/config';
import { runBenchmark } from '../shared/benchmark.js';
import { runWithoutZeroCall } from './agents/without.js';
import { runWithZeroCall } from './agents/with.js';

runBenchmark({ runWithoutZeroCall, runWithZeroCall })
  .catch(err => { console.error(err); process.exit(1); });
