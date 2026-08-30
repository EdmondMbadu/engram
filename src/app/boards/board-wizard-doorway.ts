export type BoardWizardDoorwayId =
  | 'describe'
  | 'manual'
  | 'paste'
  | 'photos'
  | 'url'
  | 'off-grid'
  | 'nearby-gems'
  | 'walking-tour'
  | 'driving-tour'
  | 'real-estate';

export type BoardWizardDoorwayMode = Exclude<BoardWizardDoorwayId, 'real-estate'>;

export function boardWizardModeForDoorway(id: BoardWizardDoorwayId): BoardWizardDoorwayMode {
  return id === 'real-estate' ? 'url' : id;
}

export function wrapBoardWizardDoorwayIndex(index: number, direction: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  const normalizedIndex = Number.isFinite(index) ? Math.trunc(index) : 0;
  const normalizedDirection = Number.isFinite(direction) ? Math.trunc(direction) : 0;
  return ((normalizedIndex + normalizedDirection) % total + total) % total;
}

export function boardWizardDoorwayOffset(index: number, activeIndex: number, total: number): number {
  if (total <= 1) return 0;
  let offset = index - activeIndex;
  const halfway = total / 2;
  if (offset > halfway) offset -= total;
  if (offset < -halfway) offset += total;
  return offset;
}
