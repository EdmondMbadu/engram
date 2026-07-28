import { canReorderCardSurface } from './card-interaction';

describe('Board card interactions', () => {
  it('allows card reordering only on the collapsed front surface', () => {
    expect(canReorderCardSurface(true, 2, false, false)).toBeTrue();
    expect(canReorderCardSurface(true, 2, true, false)).toBeFalse();
    expect(canReorderCardSurface(true, 2, false, true)).toBeFalse();
  });

  it('does not expose a reorder surface without edit access or another card', () => {
    expect(canReorderCardSurface(false, 2, false, false)).toBeFalse();
    expect(canReorderCardSurface(true, 1, false, false)).toBeFalse();
  });
});
