import { formatAssistantMessageHtml } from './message-format.util';

describe('formatAssistantMessageHtml', () => {
  it('formats ordered lists with bold content', () => {
    const html = formatAssistantMessageHtml([
      '1. **Comprehensive and Scientific Methodology**: Design Science is anticipatory.',
      '2. **Systems Thinking and Emergence**: Systems create new properties.',
    ].join('\n'));

    expect(html).toContain('<ol>');
    expect(html).toContain('<strong>Comprehensive and Scientific Methodology</strong>');
    expect(html).toContain('<strong>Systems Thinking and Emergence</strong>');
  });

  it('formats paragraphs, emphasis, and inline code', () => {
    const html = formatAssistantMessageHtml([
      'This is a **bold** claim with *emphasis* and `code`.',
      '',
      'Second paragraph.',
    ].join('\n'));

    expect(html).toContain('<p>This is a <strong>bold</strong> claim with <em>emphasis</em> and <code>code</code>.</p>');
    expect(html).toContain('<p>Second paragraph.</p>');
  });

  it('escapes raw html and preserves fenced code blocks', () => {
    const html = formatAssistantMessageHtml([
      '<script>alert("x")</script>',
      '',
      '```ts',
      'const value = "<b>safe</b>";',
      '```',
    ].join('\n'));

    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).toContain('<pre data-language="ts"><code>const value = &quot;&lt;b&gt;safe&lt;/b&gt;&quot;;</code></pre>');
  });

  it('formats blockquotes and links', () => {
    const html = formatAssistantMessageHtml([
      '> Useful quote',
      '',
      'Read [the docs](https://example.com) or visit https://openai.com.',
    ].join('\n'));

    expect(html).toContain('<blockquote>Useful quote</blockquote>');
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noreferrer noopener">the docs</a>');
    expect(html).toContain('<a href="https://openai.com" target="_blank" rel="noreferrer noopener">https://openai.com</a>.');
  });
});
