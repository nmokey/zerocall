import { createRunWithOneCall } from '../../shared/runWith.js';
import { MOCK_SNAPSHOT } from '../data/mock.js';

export const runWithOneCall = createRunWithOneCall(() => MOCK_SNAPSHOT);
