export type BoardWizardMediaKind = 'none' | 'song' | 'album' | 'film' | 'book' | 'tv' | 'game';

type MediaCard = {
  title?: string;
  subtitle?: string;
  tags?: string[];
  image_query?: string;
  image_context?: string;
  entity_type?: string;
  image_intent?: string;
  media_kind?: string;
};

const mediaKinds = new Set<BoardWizardMediaKind>(['none', 'song', 'album', 'film', 'book', 'tv', 'game']);

export function resolveBoardWizardMediaKind(card: MediaCard): BoardWizardMediaKind {
  if (mediaKinds.has(card.media_kind as BoardWizardMediaKind)) return card.media_kind as BoardWizardMediaKind;
  if (['person', 'place', 'event', 'product', 'food', 'organization'].includes(card.entity_type ?? '')
    && card.image_intent !== 'cover') return 'none';

  const explicit = `${card.image_query ?? ''} ${card.image_context ?? ''}`.toLowerCase();
  if (card.image_intent === 'cover') {
    if (/\b(song|music track|single cover)\b/.test(explicit)) return 'song';
    if (/\b(album|ep|lp)\b/.test(explicit)) return 'album';
    if (/\b(book|novel|memoir)\b/.test(explicit)) return 'book';
    if (/\b(tv|television|series|season)\b/.test(explicit)) return 'tv';
    if (/\b(video game|console game)\b/.test(explicit)) return 'game';
    if (/\b(movie|film|cinema)\b/.test(explicit)) return 'film';
  }

  // Legacy fallback is card-local and requires strong phrases. Prose and the
  // global board prompt are deliberately excluded.
  const text = `${card.title ?? ''} ${card.subtitle ?? ''} ${(card.tags ?? []).join(' ')} ${card.image_query ?? ''}`.toLowerCase();
  if (/\b(song|songs|music track|audio track|spotify track|hit single)\b/.test(text)) return 'song';
  if (/\b(album|albums|record album|album cover)\b/.test(text)) return 'album';
  if (/\b(movie|movies|film poster|feature film|cinema)\b/.test(text)) return 'film';
  if (/\b(book cover|novel|novels|memoir)\b/.test(text)) return 'book';
  if (/\b(tv series|television series|television show)\b/.test(text)) return 'tv';
  if (/\b(video game|video games|console game)\b/.test(text)) return 'game';
  return 'none';
}
