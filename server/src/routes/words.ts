// GET /api/words/meaning/:word — a short meaning for a game word (results
// screen). Only words the game accepts, so this isn't a free dictionary proxy.
import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { isValidWord } from '../game/words.js';
import { meaningFor } from '../services/wordMeaningService.js';

export const wordsRouter = Router();

wordsRouter.get('/words/meaning/:word', requireAuth, async (req, res) => {
    const word = String(req.params.word ?? '').toUpperCase();
    if (!/^[A-Z]{2,15}$/.test(word) || !isValidWord(word)) {
        return res.status(404).json({ error: 'No meaning for that word.' });
    }
    const meaning = await meaningFor(word);
    if (!meaning) return res.status(404).json({ error: 'No meaning for that word.' });
    res.set('Cache-Control', 'private, max-age=86400');
    res.json({ ...meaning, source: 'Wiktionary' });
});
