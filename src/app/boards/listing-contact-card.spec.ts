import {
  isListingContactCard,
  listingContactCardDetails,
  listingContactNarration,
} from './listing-contact-card';

describe('listing contact card', () => {
  const legacyCard = {
    title: 'Contact Edmond Mbadu',
    subtitle: 'Edmond Mbadu · Executive Realty Services · Phone: 2156877614',
    notes: [
      'Edmond Mbadu',
      'Executive Realty Services',
      'Phone: 2156877614',
      'Email: mbadungoma@gmail.com',
      'Active MLS status gibberish that should never become the invitation.',
    ].join('\n'),
    tags: ['listing', 'real-estate', 'group-next-step'],
    listingPresentation: { groupKey: 'next-step' },
  };

  it('recognizes new and already-generated real-estate contact cards', () => {
    expect(isListingContactCard(legacyCard)).toBeTrue();
    expect(isListingContactCard({ ...legacyCard, title: 'The next step', tags: ['group-next-step', 'rental'] })).toBeFalse();
    expect(isListingContactCard({ title: 'Reach out', tags: ['listing-contact'] })).toBeTrue();
  });

  it('extracts only the useful contact details from legacy copy', () => {
    expect(listingContactCardDetails(legacyCard)).toEqual({
      name: 'Edmond Mbadu',
      agency: 'Executive Realty Services',
      phone: '2156877614',
      email: 'mbadungoma@gmail.com',
      phoneHref: 'tel:2156877614',
      emailHref: 'mailto:mbadungoma@gmail.com',
    });
  });

  it('removes a duplicated agent name and trailing contact label from malformed agency copy', () => {
    const details = listingContactCardDetails({
      title: 'Contact Edmond Mbadu',
      subtitle: 'Questions about this home?',
      notes: [
        'Interested in this home? Contact Edmond Mbadu to ask a question or arrange a private showing.',
        'Edmond Mbadu',
        'Edmond Mbadu Executive Realty Services Phone:',
        'Phone: 12156877614',
        'Email: mbadungoma@gmail.com',
      ].join('\n'),
      tags: ['listing-contact'],
    });

    expect(details.agency).toBe('Executive Realty Services');
    expect(details.phone).toBe('12156877614');
    expect(details.email).toBe('mbadungoma@gmail.com');
  });

  it('uses a short invitation for narration and excludes inherited MLS prose', () => {
    const narration = listingContactNarration(legacyCard);
    expect(narration).toContain('Interested in this home?');
    expect(narration).toContain('Contact Edmond Mbadu');
    expect(narration).toContain('arrange a private showing');
    expect(narration).not.toContain('MLS status gibberish');
  });
});
