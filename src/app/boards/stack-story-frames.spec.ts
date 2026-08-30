import { buildStackStoryFrames, stackStoryFrameKey } from './stack-story-frames';

describe('Stack story frames', () => {
  it('keeps standard boards unchanged', () => {
    const frames = buildStackStoryFrames([{ id: 'one' }, { id: 'two' }], false);
    expect(frames.map((frame) => frame.kind)).toEqual(['cover', 'card', 'card', 'closing']);
  });

  it('places a handoff after every non-final tour stop', () => {
    const frames = buildStackStoryFrames([
      { id: 'third', tour: { sequence: 3 } },
      { id: 'first', tour: { sequence: 1 } },
      { id: 'second', tour: { sequence: 2 } },
    ], true);

    expect(frames.map((frame) => frame.kind)).toEqual([
      'cover',
      'card', 'handoff',
      'card', 'handoff',
      'card',
      'closing',
    ]);
    expect(frames[1].kind === 'card' ? frames[1].card.id : '').toBe('first');
    expect(frames[2].kind === 'handoff' ? frames[2].nextCard.id : '').toBe('second');
    expect(stackStoryFrameKey(frames[2])).toBe('handoff:first:second');
  });

  it('does not invent a handoff across a non-tour card', () => {
    const frames = buildStackStoryFrames([
      { id: 'first', tour: { sequence: 1 } },
      { id: 'note', tour: null },
      { id: 'second', tour: { sequence: 2 } },
    ], true);

    expect(frames.map((frame) => frame.kind)).toEqual([
      'cover', 'card', 'card', 'card', 'closing',
    ]);
  });

  it('keeps a Talking Card as a marker-less interlude in a tour', () => {
    const frames = buildStackStoryFrames([
      { id: 'first', tour: { sequence: 1 } },
      { id: 'guide', tour: null, conversation: { atlasId: 'atlas-guide' } },
      { id: 'second', tour: { sequence: 2 } },
    ], true);

    expect(frames.map(stackStoryFrameKey)).toEqual([
      'cover', 'card:first', 'card:guide', 'card:second', 'closing',
    ]);
  });
});
