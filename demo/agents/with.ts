import { createRunWithZeroCall } from '../../shared/runWith.js';
import { MOCK_SNAPSHOT } from '../data/mock.js';

export const runWithZeroCall = createRunWithZeroCall(() => MOCK_SNAPSHOT);
