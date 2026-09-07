export type ListingContactCardLike = {
  title?: string | null;
  subtitle?: string | null;
  notes?: string | null;
  tags?: readonly string[] | null;
  listingPresentation?: { groupKey?: string | null } | null;
};

export type ListingContactCardDetails = {
  name: string;
  agency: string;
  phone: string;
  email: string;
  phoneHref: string;
  emailHref: string;
};

const INVITATION_LANGUAGE = /\b(?:interested|questions?|happy to help|private showing|show you|arrange|contact|get in touch)\b/i;

function clean(value: string | null | undefined): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function contactFragments(card: ListingContactCardLike): string[] {
  const notes = typeof card.notes === 'string' ? card.notes.split(/\r?\n/) : [];
  const subtitle = typeof card.subtitle === 'string' ? card.subtitle.split(/\s*·\s*/) : [];
  return [...notes, ...subtitle].map(clean).filter(Boolean);
}

export function isListingContactCard(card: ListingContactCardLike | null | undefined): boolean {
  if (!card) return false;
  const tags = new Set((card.tags ?? []).map((tag) => clean(tag).toLowerCase()));
  if (tags.has('listing-contact')) return true;
  const isLegacyClosingCard = tags.has('group-next-step')
    && tags.has('real-estate')
    && /^contact\b/i.test(clean(card.title));
  return isLegacyClosingCard || card.listingPresentation?.groupKey === 'contact';
}

export function listingContactCardDetails(card: ListingContactCardLike): ListingContactCardDetails {
  const title = clean(card.title);
  const nameFromTitle = title.match(/^contact\s+(.+)$/i)?.[1]?.trim() || '';
  const fragments = contactFragments(card);
  const email = fragments
    .map((fragment) => fragment.match(/(?:^|\b)email\s*:\s*([^\s·]+@[^\s·]+)$/i)?.[1] || fragment.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)?.[0] || '')
    .find(Boolean) || '';
  const phone = fragments
    .map((fragment) => fragment.match(/(?:^|\b)phone\s*:\s*(.+)$/i)?.[1]?.trim() || '')
    .find(Boolean) || '';
  const name = nameFromTitle || fragments.find((fragment) => {
    return !/^(?:phone|email)\s*:/i.test(fragment)
      && !INVITATION_LANGUAGE.test(fragment)
      && fragment !== email
      && fragment !== phone;
  }) || '';
  const agency = fragments.find((fragment) => {
    return fragment !== name
      && fragment !== email
      && fragment !== phone
      && !/^(?:phone|email)\s*:/i.test(fragment)
      && !INVITATION_LANGUAGE.test(fragment)
      && fragment.length <= 120;
  }) || '';
  const phoneTarget = phone.replace(/[^+\d]/g, '');
  return {
    name,
    agency,
    phone,
    email,
    phoneHref: phoneTarget ? `tel:${phoneTarget}` : '',
    emailHref: email ? `mailto:${email}` : '',
  };
}

export function listingContactNarration(card: ListingContactCardLike): string {
  const contact = listingContactCardDetails(card);
  const opening = 'Interested in this home?';
  const person = contact.name ? ` Contact ${contact.name}` : ' Get in touch with the listing agent';
  const methods = [
    contact.phone ? `call ${contact.phone}` : '',
    contact.email ? `email ${contact.email}` : '',
  ].filter(Boolean);
  const connection = methods.length ? ` You can ${methods.join(' or ')}.` : '';
  return `${opening}${person} to ask a question or arrange a private showing.${connection}`.replace(/\s+/g, ' ').trim();
}
