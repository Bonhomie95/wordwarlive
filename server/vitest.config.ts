import { defineConfig } from 'vitest/config';

// Integration suites share one Atlas database (wordwar_test) and each seeds
// it in beforeAll, so run files one at a time; Atlas round trips are ~0.7s.
export default defineConfig({
    test: {
        fileParallelism: false,
        testTimeout: 60_000,
        hookTimeout: 180_000,
    },
});
