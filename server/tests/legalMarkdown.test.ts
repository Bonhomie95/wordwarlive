import { describe, it, expect } from 'vitest';
import { markdownToHtml } from '../src/routes/legal.js';

describe('markdownToHtml (legal pages)', () => {
    it('renders headings, paragraphs, lists, links and escapes HTML', () => {
        const html = markdownToHtml(
            '# Title\n\nSee https://example.com/a. And [Terms](/legal/terms).\n\n- **Bold** item <b>x</b>\n  continued\n- second'
        );
        expect(html).toContain('<h1>Title</h1>');
        expect(html).toContain('<a href="https://example.com/a">https://example.com/a</a>.');
        expect(html).toContain('<a href="/legal/terms">Terms</a>');
        expect(html).toContain('<li><strong>Bold</strong> item &lt;b&gt;x&lt;/b&gt; continued</li>');
        expect(html).toContain('<li>second</li>');
    });
});
