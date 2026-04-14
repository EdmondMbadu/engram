const CODE_TOKEN = '\u0000CODE';
const LINK_TOKEN = '\u0000LINK';

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; lines: string[] }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'blockquote'; lines: string[] }
  | { type: 'code'; language: string; lines: string[] };

export function formatAssistantMessageHtml(text: string | null | undefined): string {
  const normalized = normalizeLineEndings(text).trim();
  if (!normalized) {
    return '';
  }

  const blocks = parseBlocks(normalized);
  return blocks.map(renderBlock).join('');
}

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.split('\n');

  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let quote: string[] = [];
  let code: { language: string; lines: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: 'paragraph', lines: paragraph });
      paragraph = [];
    }
  };

  const flushList = () => {
    if (list) {
      blocks.push({ type: 'list', ordered: list.ordered, items: list.items });
      list = null;
    }
  };

  const flushQuote = () => {
    if (quote.length) {
      blocks.push({ type: 'blockquote', lines: quote });
      quote = [];
    }
  };

  const flushCode = () => {
    if (code) {
      blocks.push({ type: 'code', language: code.language, lines: code.lines });
      code = null;
    }
  };

  for (const line of lines) {
    const fenceMatch = line.match(/^```([\w-]+)?\s*$/);
    if (fenceMatch) {
      flushParagraph();
      flushList();
      flushQuote();

      if (code) {
        flushCode();
      } else {
        code = { language: fenceMatch[1] ?? '', lines: [] };
      }
      continue;
    }

    if (code) {
      code.lines.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      flushQuote();
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      flushQuote();
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2],
      });
      continue;
    }

    const orderedMatch = line.match(/^\s*(\d+)\.\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      flushQuote();

      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }

      list.items.push(orderedMatch[2]);
      continue;
    }

    const unorderedMatch = line.match(/^\s*[-*+]\s+(.+)$/);
    if (unorderedMatch) {
      flushParagraph();
      flushQuote();

      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }

      list.items.push(unorderedMatch[1]);
      continue;
    }

    const quoteMatch = line.match(/^\s*>\s?(.*)$/);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      quote.push(quoteMatch[1]);
      continue;
    }

    flushList();
    flushQuote();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  flushQuote();
  flushCode();

  return blocks;
}

function renderBlock(block: Block): string {
  switch (block.type) {
    case 'heading': {
      const level = Math.min(Math.max(block.level, 1), 6);
      return `<h${level}>${renderInline(block.text)}</h${level}>`;
    }
    case 'paragraph':
      return `<p>${block.lines.map(renderInline).join('<br>')}</p>`;
    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul';
      const items = block.items.map((item) => `<li>${renderInline(item)}</li>`).join('');
      return `<${tag}>${items}</${tag}>`;
    }
    case 'blockquote':
      return `<blockquote>${block.lines.map(renderInline).join('<br>')}</blockquote>`;
    case 'code': {
      const language = block.language ? ` data-language="${escapeHtml(block.language)}"` : '';
      return `<pre${language}><code>${escapeHtml(block.lines.join('\n'))}</code></pre>`;
    }
  }
}

function renderInline(text: string): string {
  let value = text;
  const stored: string[] = [];

  const stash = (prefix: string, html: string): string => {
    const index = stored.push(html) - 1;
    return `${prefix}${index}\u0000`;
  };

  value = value.replace(/`([^`\n]+)`/g, (_match, code) =>
    stash(CODE_TOKEN, `<code>${escapeHtml(code)}</code>`),
  );

  value = value.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_match, label, href) =>
      stash(
        LINK_TOKEN,
        `<a href="${escapeAttribute(href)}" target="_blank" rel="noreferrer noopener">${escapeHtml(label)}</a>`,
      ),
  );

  value = escapeHtml(value);

  value = value.replace(
    /(?<!\*)\*\*\*([^*\n]+)\*\*\*(?!\*)|(?<!_)___([^_\n]+)___(?!_)/g,
    (_match, stars, underscores) => `<strong><em>${stars ?? underscores}</em></strong>`,
  );
  value = value.replace(
    /(?<!\*)\*\*([^*\n]+)\*\*(?!\*)|(?<!_)__([^_\n]+)__(?!_)/g,
    (_match, stars, underscores) => `<strong>${stars ?? underscores}</strong>`,
  );
  value = value.replace(
    /(^|[\s([{"'])\*([^*\n]+)\*(?=$|[\s)\]}",.!?:;'])|(^|[\s([{"'])_([^_\n]+)_(?=$|[\s)\]}",.!?:;'])/g,
    (_match, beforeA, italicA, beforeB, italicB) => `${beforeA ?? beforeB}<em>${italicA ?? italicB}</em>`,
  );

  value = value.replace(/(https?:\/\/[^\s<]+)/g, (match) => {
    const [url, trailing] = splitTrailingUrlPunctuation(match);
    return `${stash(
      LINK_TOKEN,
      `<a href="${escapeAttribute(url)}" target="_blank" rel="noreferrer noopener">${url}</a>`,
    )}${trailing}`;
  });

  value = value.replace(new RegExp(`${CODE_TOKEN}(\\d+)\\u0000`, 'g'), (_match, index) => stored[Number(index)] ?? '');
  value = value.replace(new RegExp(`${LINK_TOKEN}(\\d+)\\u0000`, 'g'), (_match, index) => stored[Number(index)] ?? '');

  return value;
}

function normalizeLineEndings(text: string | null | undefined): string {
  return String(text ?? '').replace(/\r\n?/g, '\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(text: string): string {
  return escapeHtml(text);
}

function splitTrailingUrlPunctuation(value: string): [string, string] {
  const match = value.match(/^(.*?)([),.!?:;]+)?$/);
  if (!match) {
    return [value, ''];
  }

  const url = match[1] || value;
  const trailing = match[2] ?? '';
  return [url, trailing];
}
