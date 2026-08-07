import { BOARD_ICON_OPTIONS, resolveBoardIcon } from './board-icon';

describe('resolveBoardIcon', () => {
  it('keeps supported Material Symbols icons', () => {
    expect(resolveBoardIcon('restaurant')).toBe('restaurant');
    expect(resolveBoardIcon('sports_handball')).toBe('sports_handball');
  });

  it('maps human icon labels to valid Material Symbols names', () => {
    expect(resolveBoardIcon('Handball')).toBe('sports_handball');
    expect(resolveBoardIcon('coffee')).toBe('local_cafe');
  });

  it('infers a useful icon when stored icon data is malformed', () => {
    expect(resolveBoardIcon('eb', { title: 'Best museums in Philadelphia' })).toBe('museum');
    expect(resolveBoardIcon('', { title: 'Neighborhood coffee shops' })).toBe('local_cafe');
  });

  it('uses a guaranteed generic fallback for unknown data', () => {
    expect(resolveBoardIcon('this icon does not exist')).toBe('dashboard_customize');
    expect(new Set<string>(BOARD_ICON_OPTIONS).has(resolveBoardIcon(null))).toBeTrue();
  });
});
