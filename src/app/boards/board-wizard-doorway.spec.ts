import {
  boardWizardDoorwayOffset,
  boardWizardModeForDoorway,
  wrapBoardWizardDoorwayIndex,
  type BoardWizardDoorwayId,
} from './board-wizard-doorway';

describe('board wizard doorway carousel', () => {
  it('keeps every established doorway mode unchanged', () => {
    const establishedModes: BoardWizardDoorwayId[] = [
      'describe',
      'manual',
      'paste',
      'photos',
      'url',
      'off-grid',
      'nearby-gems',
      'walking-tour',
      'driving-tour',
    ];

    establishedModes.forEach((mode) => expect(boardWizardModeForDoorway(mode)).toBe(mode));
  });

  it('routes the Real estate doorway through the established URL mode', () => {
    expect(boardWizardModeForDoorway('real-estate')).toBe('url');
  });

  it('wraps in both directions without leaving the available range', () => {
    expect(wrapBoardWizardDoorwayIndex(0, -1, 10)).toBe(9);
    expect(wrapBoardWizardDoorwayIndex(9, 1, 10)).toBe(0);
    expect(wrapBoardWizardDoorwayIndex(3, 1, 10)).toBe(4);
    expect(wrapBoardWizardDoorwayIndex(0, 1, 0)).toBe(0);
  });

  it('returns compact circular offsets for the visible neighbor cards', () => {
    expect(boardWizardDoorwayOffset(9, 0, 10)).toBe(-1);
    expect(boardWizardDoorwayOffset(0, 9, 10)).toBe(1);
    expect(boardWizardDoorwayOffset(4, 4, 10)).toBe(0);
  });
});
