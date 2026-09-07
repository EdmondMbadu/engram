export type RealEstateRecapContact = {
  name: string;
  agency: string;
  phone: string;
  email: string;
};

export type RealEstateTalkingCardRecapContext = {
  propertyTitle: string;
  propertySubtitle: string;
  propertyDescription: string;
  propertyFacts: string[];
  propertyImageUrls: string[];
  listingUrl: string | null;
  contact: RealEstateRecapContact | null;
};

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' ? value as UnknownRecord : null;
}

function cleanText(value: unknown, maxLength = 500): string {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : '';
}

function cardTags(card: UnknownRecord): Set<string> {
  return new Set((Array.isArray(card.tags) ? card.tags : [])
    .map((tag) => cleanText(tag, 48).toLowerCase())
    .filter(Boolean));
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  return parts[0] === 10
    || parts[0] === 127
    || parts[0] === 0
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

/** Only URLs that are safe to render or link from an external email. */
export function safeRecapHttpsUrl(value: unknown): string | null {
  const raw = cleanText(value, 2000);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const privateIpv6 = hostname.includes(':') && (
      hostname === '::1'
      || hostname.startsWith('fc')
      || hostname.startsWith('fd')
      || hostname.startsWith('fe8')
      || hostname.startsWith('fe9')
      || hostname.startsWith('fea')
      || hostname.startsWith('feb')
    );
    if (
      url.protocol !== 'https:'
      || !hostname
      || hostname === 'localhost'
      || hostname.endsWith('.localhost')
      || hostname.endsWith('.local')
      || privateIpv6
      || isPrivateIpv4(hostname)
      || url.username
      || url.password
    ) {
      return null;
    }
    return url.toString().slice(0, 2000);
  } catch {
    return null;
  }
}

function isRealEstateBoard(board: UnknownRecord, cards: UnknownRecord[]): boolean {
  const hasListingStory = cards.some((card) => {
    const tags = cardTags(card);
    return tags.has('real-estate') && (tags.has('listing') || tags.has('listing-story'));
  });
  if (hasListingStory) return true;
  return /real estate virtualtalkthru/i.test(`${cleanText(board.title, 140)} ${cleanText(board.description, 300)}`);
}

function isListingContactCard(card: UnknownRecord): boolean {
  const tags = cardTags(card);
  if (tags.has('listing-contact')) return true;
  const presentation = record(card.listingPresentation);
  return presentation?.groupKey === 'contact'
    || (tags.has('real-estate') && tags.has('group-next-step') && /^contact\b/i.test(cleanText(card.title, 120)));
}

function contactFragments(card: UnknownRecord): string[] {
  const notes = typeof card.notes === 'string' ? card.notes.split(/\r?\n/) : [];
  const subtitle = typeof card.subtitle === 'string' ? card.subtitle.split(/\s*·\s*/) : [];
  return [...notes, ...subtitle].map((item) => cleanText(item, 254)).filter(Boolean);
}

function contactFromCard(card: UnknownRecord): RealEstateRecapContact | null {
  const fragments = contactFragments(card);
  const title = cleanText(card.title, 140);
  const nameFromTitle = title.match(/^contact\s+(.+)$/i)?.[1]?.trim() || '';
  const email = fragments
    .map((fragment) => fragment.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0] || '')
    .find(Boolean) || '';
  const phone = fragments
    .map((fragment) => fragment.match(/(?:^|\b)phone\s*:\s*(.+)$/i)?.[1]?.trim() || '')
    .find(Boolean) || '';
  const invitationLanguage = /\b(?:interested|questions?|happy to help|private showing|show you|arrange|contact|get in touch)\b/i;
  const nonContactLines = fragments.filter((fragment) => {
    return !/^(?:phone|email)\s*:/i.test(fragment)
      && fragment !== email
      && fragment !== phone
      && !invitationLanguage.test(fragment);
  });
  const name = nameFromTitle || nonContactLines[0] || '';
  let agency = nonContactLines.find((fragment) => fragment !== name && fragment.length <= 140) || '';
  if (name && agency.toLowerCase().startsWith(name.toLowerCase())) {
    agency = cleanText(agency.slice(name.length), 140);
  }
  const normalizedEmail = email.toLowerCase();
  return normalizedEmail || phone
    ? { name, agency, phone, email: normalizedEmail }
    : null;
}

function overviewCard(cards: UnknownRecord[]): UnknownRecord | null {
  return cards.find((card) => cardTags(card).has('group-overview'))
    ?? cards.find((card) => {
      const tags = cardTags(card);
      return tags.has('real-estate') && tags.has('listing-story') && !card.authorOnly;
    })
    ?? null;
}

function uniqueFacts(board: UnknownRecord, card: UnknownRecord | null): string[] {
  const boardDescription = cleanText(board.description, 500);
  const boardDetailSection = boardDescription.match(/\s—\s(.+?)(?:,\s+arranged\b|$)/i)?.[1] || '';
  const candidates = [
    cleanText(card?.price, 80),
    ...cleanText(card?.subtitle, 300).split(/\s*(?:·|\||\n)\s*/),
    ...boardDetailSection.split(/\s*(?:·|\||\n)\s*/),
  ];
  const seen = new Set<string>();
  return candidates.filter((fact) => {
    const cleaned = cleanText(fact, 100);
    const key = cleaned.toLowerCase()
      .replace(/\b(?:beds?|bedrooms?)\b/g, 'bed')
      .replace(/\b(?:baths?|bathrooms?)\b/g, 'bath')
      .replace(/\s+/g, ' ');
    if (!cleaned || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6).map((fact) => cleanText(fact, 100));
}

function propertyImages(board: UnknownRecord, cards: UnknownRecord[], overview: UnknownRecord | null): string[] {
  const presentation = record(overview?.listingPresentation);
  const presented = Array.isArray(presentation?.presentationImageUrls)
    ? presentation.presentationImageUrls
    : [];
  const overviewImages = Array.isArray(overview?.imageUrls) ? overview.imageUrls : [];
  const otherListingImages = cards
    .filter((card) => cardTags(card).has('listing') && !card.authorOnly && !isListingContactCard(card))
    .flatMap((card) => [card.imageUrl]);
  const candidates = [
    ...presented,
    overview?.imageUrl,
    ...overviewImages,
    ...otherListingImages,
    board.imageUrl,
  ];
  const seen = new Set<string>();
  return candidates.flatMap((value) => {
    const url = safeRecapHttpsUrl(value);
    if (!url || seen.has(url)) return [];
    seen.add(url);
    return [url];
  }).slice(0, 4);
}

export function buildRealEstateTalkingCardRecapContext(
  boardValue: unknown,
  talkingCardValue: unknown,
): RealEstateTalkingCardRecapContext | null {
  const board = record(boardValue);
  const talkingCard = record(talkingCardValue);
  if (!board || !talkingCard || !cardTags(talkingCard).has('listing-agent-guide')) return null;
  const cards = (Array.isArray(board.cards) ? board.cards : [])
    .map(record)
    .filter((card): card is UnknownRecord => !!card);
  if (!isRealEstateBoard(board, cards)) return null;

  const overview = overviewCard(cards);
  const contactCard = cards.find((card) => !card.authorOnly && isListingContactCard(card)) ?? null;
  const propertyTitle = cleanText(overview?.entityName, 140)
    || cleanText(overview?.title, 140)
    || cleanText(board.title, 140)
    || 'Property';
  const propertySubtitle = cleanText(overview?.subtitle, 240);
  const boardDescription = cleanText(board.description, 500);
  const descriptionCandidate = /\b(?:real estate virtualtalkthru|rental talkthru)\b/i.test(boardDescription)
    ? cleanText(overview?.notes, 500)
    : boardDescription || cleanText(overview?.notes, 500);
  const propertyDescription = descriptionCandidate.toLowerCase() === propertyTitle.toLowerCase()
    ? ''
    : descriptionCandidate;

  return {
    propertyTitle,
    propertySubtitle,
    propertyDescription,
    propertyFacts: uniqueFacts(board, overview),
    propertyImageUrls: propertyImages(board, cards, overview),
    listingUrl: safeRecapHttpsUrl(overview?.sourceUrl),
    contact: contactCard ? contactFromCard(contactCard) : null,
  };
}
