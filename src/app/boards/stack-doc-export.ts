export type StackDocsExportCardInput = {
  id: string;
  title: string;
  narration: string;
  imageUrls: string[];
  sourceUrl?: string | null;
};

export type StackDocsExportSnapshot = {
  requestId: string;
  boardId: string;
  documentTitle: string;
  sourceUrl: string;
  ownerName: string;
  exportedAt: string;
  opening: {
    title: string;
    description: string;
    coverImageUrl: string;
  };
  cards: Array<{
    id: string;
    position: number;
    title: string;
    narration: string;
    imageUrls: string[];
    sourceUrl: string;
    wordCount: number;
    estimatedSeconds: number;
  }>;
  closing: {
    included: boolean;
    headline: string;
    message: string;
    imageUrl: string;
    qrImageUrl: string;
  };
  productionNotes: {
    included: boolean;
    narrator: string;
    music: string;
    format: string;
    ratio: string;
    socialCaption: string;
  };
};

export type BuildStackDocsExportSnapshotInput = {
  requestId: string;
  boardId: string;
  documentTitle: string;
  sourceUrl: string;
  ownerName: string;
  exportedAt?: string;
  opening: {
    title: string;
    description: string;
    coverImageUrl?: string | null;
  };
  cards: StackDocsExportCardInput[];
  closing: {
    included: boolean;
    headline: string;
    message: string;
    imageUrl?: string | null;
    qrImageUrl?: string | null;
  };
  productionNotes: {
    included: boolean;
    narrator: string;
    music: string;
    format: string;
    ratio: string;
    socialCaption: string;
  };
  includeCover: boolean;
  includeAllCardImages: boolean;
};

export function buildStackDocsExportSnapshot(
  input: BuildStackDocsExportSnapshotInput,
): StackDocsExportSnapshot {
  const cards = input.cards.map((card, index) => {
    const narration = normalizeMultilineText(card.narration);
    const imageUrls = uniqueUrls(card.imageUrls);
    return {
      id: normalizeSingleLineText(card.id),
      position: index + 1,
      title: normalizeSingleLineText(card.title) || `Card ${index + 1}`,
      narration,
      imageUrls: input.includeAllCardImages ? imageUrls : imageUrls.slice(0, 1),
      sourceUrl: normalizeUrl(card.sourceUrl),
      wordCount: wordCount(narration),
      estimatedSeconds: estimatedNarrationSeconds(narration),
    };
  });

  return {
    requestId: normalizeSingleLineText(input.requestId),
    boardId: normalizeSingleLineText(input.boardId),
    documentTitle: normalizeSingleLineText(input.documentTitle) || 'LivingWiki Script & Images',
    sourceUrl: normalizeUrl(input.sourceUrl),
    ownerName: normalizeSingleLineText(input.ownerName),
    exportedAt: input.exportedAt || new Date().toISOString(),
    opening: {
      title: normalizeSingleLineText(input.opening.title) || 'Untitled LivingWiki Stack',
      description: normalizeMultilineText(input.opening.description),
      coverImageUrl: input.includeCover ? normalizeUrl(input.opening.coverImageUrl) : '',
    },
    cards,
    closing: {
      included: input.closing.included,
      headline: normalizeSingleLineText(input.closing.headline) || 'Keep exploring',
      message: normalizeMultilineText(input.closing.message),
      imageUrl: input.closing.included ? normalizeUrl(input.closing.imageUrl) : '',
      qrImageUrl: input.closing.included ? normalizeUrl(input.closing.qrImageUrl) : '',
    },
    productionNotes: {
      included: input.productionNotes.included,
      narrator: normalizeSingleLineText(input.productionNotes.narrator),
      music: normalizeSingleLineText(input.productionNotes.music),
      format: normalizeSingleLineText(input.productionNotes.format),
      ratio: normalizeSingleLineText(input.productionNotes.ratio),
      socialCaption: normalizeMultilineText(input.productionNotes.socialCaption),
    },
  };
}

export function stackDocsExportImageCount(snapshot: StackDocsExportSnapshot): number {
  return (snapshot.opening.coverImageUrl ? 1 : 0)
    + snapshot.cards.reduce((total, card) => total + card.imageUrls.length, 0)
    + (snapshot.closing.included && snapshot.closing.imageUrl ? 1 : 0)
    + (snapshot.closing.included && snapshot.closing.qrImageUrl ? 1 : 0);
}

export function stackDocsExportMissingNarrationCount(snapshot: StackDocsExportSnapshot): number {
  return snapshot.cards.filter((card) => !card.narration).length;
}

function wordCount(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

function estimatedNarrationSeconds(value: string): number {
  const words = wordCount(value);
  return words > 0 ? Math.max(1, Math.ceil(words / 2.35)) : 0;
}

function uniqueUrls(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => normalizeUrl(value)).filter(Boolean)));
}

function normalizeUrl(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSingleLineText(value: string): string {
  return normalizeMultilineText(value).replace(/\s+/g, ' ').trim();
}

function normalizeMultilineText(value: string): string {
  return String(value ?? '').replace(/\r\n?/g, '\n').trim();
}
