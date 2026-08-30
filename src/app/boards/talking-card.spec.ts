import { normalizeBoardCardConversation, talkingCardCtaLabel } from './talking-card';

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
});
