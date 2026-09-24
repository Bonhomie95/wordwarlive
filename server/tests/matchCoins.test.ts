import { describe, it, expect } from 'vitest';
import { matchCoins, COINS_MATCH_WIN, COINS_MATCH_TIE, COINS_MATCH_LOSS } from '../src/services/coinsService.js';

describe('matchCoins', () => {
    it('pays every player who played, never a quitter or an idle player', () => {
        expect(matchCoins({ result: 'win', forfeited: false, guessed: true })).toBe(COINS_MATCH_WIN);
        expect(matchCoins({ result: 'win', forfeited: false, guessed: false })).toBe(COINS_MATCH_WIN); // opponent quit
        expect(matchCoins({ result: 'tie', forfeited: false, guessed: true })).toBe(COINS_MATCH_TIE);
        expect(matchCoins({ result: 'loss', forfeited: false, guessed: true })).toBe(COINS_MATCH_LOSS);
        expect(matchCoins({ result: 'loss', forfeited: false, guessed: false })).toBe(0);
        expect(matchCoins({ result: 'loss', forfeited: true, guessed: true })).toBe(0);
        expect(matchCoins({ result: 'tie', forfeited: true, guessed: true })).toBe(0);
    });
});
