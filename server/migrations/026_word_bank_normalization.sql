-- Preserve one canonical spelling, preferring an existing uppercase row.
-- The primary key prevents exact duplicates; this also handles case/space variants.
WITH duplicates AS (
    SELECT ctid, row_number() OVER (
        PARTITION BY upper(trim(word))
        ORDER BY (word = upper(trim(word))) DESC, word
    ) AS position
    FROM word_bank
)
DELETE FROM word_bank WHERE ctid IN (SELECT ctid FROM duplicates WHERE position > 1);

UPDATE word_bank SET word = upper(trim(word)), length = char_length(trim(word))
WHERE word <> upper(trim(word)) OR length <> char_length(trim(word));

ALTER TABLE word_bank ADD CONSTRAINT word_bank_canonical_check
    CHECK (word ~ '^[A-Z]{4,10}$' AND length = char_length(word));
