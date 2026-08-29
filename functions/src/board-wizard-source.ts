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

export function parseNumberedBoardSource(value: string): NumberedBoardSource | null {
  const lines = value.replace(/\r\n?/g, '\n').split('\n');
  const preamble: string[] = [];
  const items: NumberedBoardSourceItem[] = [];
  let current: NumberedBoardSourceItem | null = null;

  const finishCurrent = () => {
    if (!current) {
      return;
    }
    current.body = stripTrailingGenerationCommentary(cleanSourceMarkdown(current.body));
    items.push(current);
    current = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const numberedMarker = line.match(/^(\d{1,3})[.)]\s+(.+)$/);
    const sceneMarker = line.match(/^(?:#{1,6}\s*)?scene\s+(\d{1,3})(?:\s*[:.)\-–—]\s*(.+))?$/i);
    const marker = numberedMarker ?? sceneMarker;
    if (marker?.[1] && (numberedMarker?.[2] || sceneMarker)) {
      finishCurrent();
      const rank = Number.parseInt(marker[1], 10);
      const explicitSceneTitle = sceneMarker?.[2] ? cleanSourceMarkdown(sceneMarker[2]) : '';
      const heading = numberedMarker
        ? cleanSourceMarkdown(numberedMarker[2])
        : explicitSceneTitle || `Scene ${rank}`;
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

function stripTrailingGenerationCommentary(value: string): string {
  return value
    .replace(/\s+This (?:version|script|board) should (?:run|take|last) approximately [^.]{1,120}\.\s*$/i, '')
    .trim();
}
