import { serverTimestamp } from 'firebase/firestore';
import { boardCityMetadataForFirestore, omitUndefinedDeep } from './firestore-payload';

describe('omitUndefinedDeep', () => {
  it('removes undefined values throughout nested board data', () => {
    const payload: Record<string, unknown> = {
      title: 'Lunch',
      imageSource: undefined,
      cards: [
        {
          title: 'Classic Cheesesteak',
          imageUrl: 'https://example.com/cheesesteak.jpg',
          imageSource: 'source-page',
          optional: undefined,
          metadata: {
            productUrl: undefined,
            price: '$8.49+',
          },
        },
        undefined,
      ],
      tourMeta: null,
    };

    expect(omitUndefinedDeep(payload)).toEqual({
      title: 'Lunch',
      cards: [
        {
          title: 'Classic Cheesesteak',
          imageUrl: 'https://example.com/cheesesteak.jpg',
          imageSource: 'source-page',
          metadata: {
            price: '$8.49+',
          },
        },
      ],
      tourMeta: null,
    });
  });

  it('does not traverse Firestore sentinel objects', () => {
    const sentinel = serverTimestamp();

    const cleaned = omitUndefinedDeep({ server_updated_at: sentinel });

    expect(cleaned.server_updated_at).toBe(sentinel);
  });

  it('does not mutate the source value', () => {
    const source = { nested: { keep: true, remove: undefined } };

    const cleaned = omitUndefinedDeep(source);

    expect(cleaned).not.toBe(source);
    expect(cleaned.nested).not.toBe(source.nested);
    expect(Object.prototype.hasOwnProperty.call(source.nested, 'remove')).toBeTrue();
  });
});

describe('boardCityMetadataForFirestore', () => {
  it('omits empty privileged city metadata from personal board saves', () => {
    expect(boardCityMetadataForFirestore('', '')).toEqual({});
    expect(boardCityMetadataForFirestore('   ', null)).toEqual({});
  });

  it('preserves non-empty city metadata for trusted publisher payloads', () => {
    expect(boardCityMetadataForFirestore(' atlas-philly ', ' atlas-philly ')).toEqual({
      atlas_id: 'atlas-philly',
      generated_for_atlas_id: 'atlas-philly',
    });
  });
});
