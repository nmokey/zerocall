import 'dotenv/config';
import { runBenchmark } from '../shared/benchmark.js';
import { runWithoutOneCall } from './agents/without.js';
import { runWithOneCall } from './agents/with.js';

runBenchmark({ runWithoutOneCall, runWithOneCall })
  .catch(err => { console.error(err); process.exit(1); });
