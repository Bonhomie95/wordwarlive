-- Mystery-mode fairness fix: each player now races the OPPONENT's submitted
-- word, so a match can have two different target words. p2_word is NULL when
-- both players had the same word (classic, private, vs-bot matches).

ALTER TABLE matches ADD COLUMN p2_word text;
ALTER TABLE match_replays ADD COLUMN p2_word text;
