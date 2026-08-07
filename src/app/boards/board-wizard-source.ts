export const BOARD_WIZARD_PASTE_MAX_LENGTH = 30_000;

export type NumberedBoardSourceItem = {
  rank: number;
  heading: string;
  title: string;
  subtitle: string;
  body: string;
};

export type NumberedBoardSource = {
  title: string;
  description: string;
  items: NumberedBoardSourceItem[];
};

export function detectBoardWizardSourceUrl(
  mode: string,
  prompt: string,
  explicitUrl: string,
): string {
  if (mode !== 'describe' && mode !== 'url') return '';
  const value = mode === 'url' ? explicitUrl : prompt;
  const markdownTarget = value.match(/\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/i)?.[1];
  const candidate = markdownTarget ?? value.match(/https?:\/\/[^\s<>"'\]]+/i)?.[0] ?? '';
  return trimBoardWizardUrlPunctuation(candidate);
}

function trimBoardWizardUrlPunctuation(value: string): string {
  let trimmed = value.replace(/[.,;!?]+$/, '');
  while (
    trimmed.endsWith(')')
    && (trimmed.match(/\)/g)?.length ?? 0) > (trimmed.match(/\(/g)?.length ?? 0)
  ) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed;
}

export function parseNumberedBoardSource(value: string): NumberedBoardSource | null {
  const lines = value.replace(/\r\n?/g, '\n').split('\n');
  const preamble: string[] = [];
  const items: NumberedBoardSourceItem[] = [];
  let current: NumberedBoardSourceItem | null = null;

  const finishCurrent = () => {
    if (!current) {
      return;
    }
    current.body = cleanSourceMarkdown(current.body);
    items.push(current);
    current = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const marker = line.match(/^(\d{1,3})[.)]\s+(.+)$/);
    if (marker?.[1] && marker[2]) {
      finishCurrent();
      const rank = Number.parseInt(marker[1], 10);
      const heading = cleanSourceMarkdown(marker[2]);
      const headingParts = heading.match(/^(.+?)\s+(?:—|–|-)\s+(.+)$/);
      current = {
        rank,
        heading,
        title: (headingParts?.[1] ?? heading).trim(),
        subtitle: (headingParts?.[2] ?? '').trim(),
        body: '',
      };
      continue;
    }

    if (current) {
      if (line) {
        current.body = `${current.body} ${line}`.trim();
      }
    } else if (line) {
      preamble.push(line);
    }
  }
  finishCurrent();

  if (items.length < 3 || items.some((item, index) => item.rank !== index + 1)) {
    return null;
  }

  return {
    title: cleanSourceMarkdown(preamble[0] ?? ''),
    description: cleanSourceMarkdown(preamble.slice(1).join(' ')),
    items,
  };
}

function cleanSourceMarkdown(value: string): string {
  return value
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/^[#>*_`~\s-]+|[*_`~]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
