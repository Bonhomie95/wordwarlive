import { describe, expect, it } from 'vitest';
import { resolveApiUrl } from '../../mobile/src/api/resolveApiUrl';

describe('mobile API address', () => {
    it.each(['localhost', '127.0.0.1', '[::1]'])('routes %s through the development computer', (host) => {
        expect(resolveApiUrl(`http://${host}:6011`, true, '192.168.8.145:8082')).toBe('http://192.168.8.145:6011');
    });
    it('preserves explicit remote URLs and release configuration', () => {
        expect(resolveApiUrl('https://api.wordwar.app/', true, '192.168.8.145:8082')).toBe('https://api.wordwar.app');
        expect(resolveApiUrl('http://localhost:6011', false, '192.168.8.145:8082')).toBe('http://localhost:6011');
    });
    it('supports simulator hosts and a missing Metro host', () => {
        expect(resolveApiUrl('http://localhost:6011', true, 'localhost:8082')).toBe('http://localhost:6011');
        expect(resolveApiUrl('http://localhost:6011', true)).toBe('http://localhost:6011');
    });
});
