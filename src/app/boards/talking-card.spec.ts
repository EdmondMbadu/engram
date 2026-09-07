import {
  normalizeBoardCardConversation,
  normalizeTalkingCardActions,
  talkingCardCtaLabel,
  talkingCardStarters,
} from './talking-card';

describe('Talking Card model', () => {
  it('normalizes a valid Atlas reference without retaining unknown fields', () => {
    expect(normalizeBoardCardConversation({
      version: 99,
      provider: 'atlas',
      atlasId: ' atlas-123 ',
      openingMessage: ' Hello ',
      ctaLabel: ' Ask me ',
      systemPrompt: 'must not be stored on a board',
    })).toEqual({
      version: 1,
      provider: 'atlas',
      atlasId: 'atlas-123',
      openingMessage: 'Hello',
      ctaLabel: 'Ask me',
    });
  });

  it('rejects missing and unsupported provider references', () => {
    expect(normalizeBoardCardConversation(null)).toBeNull();
    expect(normalizeBoardCardConversation({ provider: 'other', atlasId: 'a' })).toBeNull();
    expect(normalizeBoardCardConversation({ provider: 'atlas', atlasId: '' })).toBeNull();
  });

  it('uses an accessible default call to action', () => {
    expect(talkingCardCtaLabel(null)).toBe('Talk to me');
    expect(talkingCardCtaLabel({ version: 1, provider: 'atlas', atlasId: 'a', openingMessage: '' })).toBe('Talk to me');
  });

  it('normalizes scheduling and additional links while rejecting unsafe URLs', () => {
    expect(normalizeTalkingCardActions([
      { id: 'schedule-1', kind: 'schedule', label: ' Book a showing ', url: 'https://calendly.com/maya/showing', description: ' Pick a time. ' },
      { id: 'listing', kind: 'link', label: 'View listing', url: 'https://example.com/listing' },
      { id: 'fcc', kind: 'link', label: 'FCC', url: 'https://fcc.gov/consumer' },
      { id: 'unsafe', kind: 'link', label: 'Unsafe', url: 'javascript:alert(1)' },
      { id: 'private', kind: 'link', label: 'Private', url: 'https://127.0.0.1/admin' },
    ])).toEqual([
      { id: 'schedule-1', kind: 'schedule', label: 'Book a showing', url: 'https://calendly.com/maya/showing', description: 'Pick a time.' },
      { id: 'listing', kind: 'link', label: 'View listing', url: 'https://example.com/listing' },
      { id: 'fcc', kind: 'link', label: 'FCC', url: 'https://fcc.gov/consumer' },
    ]);
  });

  it('preserves normalized actions on the board conversation model', () => {
    expect(normalizeBoardCardConversation({
      provider: 'atlas',
      atlasId: 'avatar-1',
      openingMessage: 'Hello',
      actions: [{ kind: 'schedule', label: 'Schedule', url: 'https://cal.com/maya' }],
    })?.actions).toEqual([
      { id: 'schedule-1', kind: 'schedule', label: 'Schedule', url: 'https://cal.com/maya' },
    ]);
  });

  it('keeps at most three concise, unique starter questions', () => {
    const longQuestion = 'x'.repeat(140);
    const conversation = normalizeBoardCardConversation({
      provider: 'atlas',
      atlasId: 'agent-avatar',
      openingMessage: 'Ask me about this home.',
      starters: ['  What are the key features?  ', 'What are the key features?', longQuestion, 'How do I book a tour?'],
    });

    expect(talkingCardStarters(conversation)).toEqual([
      'What are the key features?',
      longQuestion.slice(0, 120),
      'How do I book a tour?',
    ]);
  });
});
