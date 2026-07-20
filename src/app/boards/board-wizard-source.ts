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
  items: NumberedBoardSourceItem[];
};

export function parseNumberedBoardSource(value: string): NumberedBoardSource | null {
  const lines = value.replace(/\r\n?/g, '\n').split('\n');
  const preamble: string[] = [];
  const items: NumberedBoardSourceItem[] = [];
  let current: NumberedBoardSourceItem | null = null;

  const finishCurrent = () => {
    if (!current) {
      return;
    }
    current.body = current.body.replace(/\s+/g, ' ').trim();
    items.push(current);
    current = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const marker = line.match(/^(\d{1,3})[.)]\s+(.+)$/);
    if (marker?.[1] && marker[2]) {
      finishCurrent();
      const rank = Number.parseInt(marker[1], 10);
      const heading = marker[2].replace(/\s+/g, ' ').trim();
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
    title: preamble.at(-1)?.replace(/\s+/g, ' ').trim() ?? '',
    items,
  };
}
