export type StackStoryCardLike = {
  id: string;
  tour?: { sequence?: number | null } | null;
};

export type StackStoryFrame<T> =
  | { kind: 'cover' }
  | { kind: 'card'; card: T }
  | { kind: 'handoff'; card: T; nextCard: T }
  | { kind: 'closing' };

function tourDisplayOrder<T extends StackStoryCardLike>(cards: readonly T[]): T[] {
  const tourCards = cards
    .filter((card) => !!card.tour)
    .map((card, sourceIndex) => ({ card, sourceIndex }))
    .sort((left, right) =>
      (left.card.tour?.sequence ?? 0) - (right.card.tour?.sequence ?? 0)
      || left.sourceIndex - right.sourceIndex)
    .map(({ card }) => card);
  let tourIndex = 0;
  return cards.map((card) => card.tour ? tourCards[tourIndex++] ?? card : card);
}

export function buildStackStoryFrames<T extends StackStoryCardLike>(
  cards: readonly T[],
  tourBoard: boolean,
): Array<StackStoryFrame<T>> {
  const orderedCards = tourBoard ? tourDisplayOrder(cards) : [...cards];
  const frames: Array<StackStoryFrame<T>> = [{ kind: 'cover' }];
  orderedCards.forEach((card, index) => {
    frames.push({ kind: 'card', card });
    const nextCard = orderedCards[index + 1];
    if (tourBoard && card.tour && nextCard?.tour) {
      frames.push({ kind: 'handoff', card, nextCard });
    }
  });
  frames.push({ kind: 'closing' });
  return frames;
}

export function stackStoryFrameKey<T extends StackStoryCardLike>(frame: StackStoryFrame<T>): string {
  switch (frame.kind) {
    case 'cover': return 'cover';
    case 'card': return `card:${frame.card.id}`;
    case 'handoff': return `handoff:${frame.card.id}:${frame.nextCard.id}`;
    case 'closing': return 'closing';
  }
}
