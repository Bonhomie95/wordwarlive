// Shared MongoDB lifecycle for the integration suites. Everything is a
// dynamic import so an unset MONGODB_URL never triggers the env loader
// (which hard-exits) — suites gate themselves with describe.skipIf(!hasDb).
import { afterAll, beforeAll } from 'vitest';

export const hasDb = !!process.env.MONGODB_URL;

export const mongo = () => import('../../src/db/mongo.js');

/** Call inside a describe: connects + seeds once, closes in afterAll. */
export function useDb(): void {
    beforeAll(async () => {
        await (await mongo()).connectMongo();
        // Like src/index.ts, load every module that registers indexes before
        // seed() runs ensureIndexes(); the suites import services lazily.
        await Promise.all(Object.values(import.meta.glob([
            '../../src/services/*.ts', '../../src/iap/verify.ts', '../../src/routes/productEvents.ts',
            '../../src/ai/dailyWord.ts', '../../src/game/words.ts',
        ])).map((load) => load()));
        await (await import('../../src/db/seed.js')).seed();
    });
    afterAll(async () => {
        (await import('../../src/db/redis.js')).redis.disconnect();
        await (await mongo()).closeMongo();
    });
}
