/** Normalize spelling and derive length from the word, never the input bucket. */
export function normalizeWordBank(data: Record<string, string[]>): { word: string; length: number }[] {
    const unique = new Set<string>();
    for (const words of Object.values(data)) {
        for (const entry of words) {
            const word = entry.trim().toUpperCase();
            if (!/^[A-Z]{4,10}$/.test(word)) throw new Error(`Invalid word-bank entry: ${entry}`);
            unique.add(word);
        }
    }
    return [...unique].sort().map((word) => ({ word, length: word.length }));
}
