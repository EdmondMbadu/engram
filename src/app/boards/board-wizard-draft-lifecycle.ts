export type BoardWizardDraftLifecycleStep = 'choose' | 'configure' | 'loading' | 'source-review' | 'listing-setup' | 'preview' | 'done';

export type BoardWizardDraftLifecycleState = {
  step: BoardWizardDraftLifecycleStep;
  hasResult: boolean;
  cardCount: number;
  saving: boolean;
  restoring: boolean;
};

export type BoardWizardImageProgress = Readonly<{
  completed: number;
  total: number;
}>;

export function hasBoardWizardDraftContent(state: Pick<BoardWizardDraftLifecycleState, 'hasResult' | 'cardCount'>): boolean {
  return state.hasResult && state.cardCount > 0;
}

export function shouldAutosaveBoardWizardDraft(state: BoardWizardDraftLifecycleState): boolean {
  return hasBoardWizardDraftContent(state)
    && state.step === 'preview'
    && !state.saving
    && !state.restoring;
}

export function shouldFlushBoardWizardDraftOnClose(
  state: Pick<BoardWizardDraftLifecycleState, 'step' | 'hasResult' | 'cardCount'>,
): boolean {
  return state.step !== 'done' && hasBoardWizardDraftContent(state);
}

export function boardWizardStepAfterGenerationFailure(hasPreviousPreview: boolean): BoardWizardDraftLifecycleStep {
  return hasPreviousPreview ? 'preview' : 'configure';
}

export function shouldRetryBoardWizardDraftAutosave(snapshotKey: string, failedSnapshotKey: string): boolean {
  return !!snapshotKey && snapshotKey !== failedSnapshotKey;
}

export function isBoardWizardImageEnrichmentActive(progress: BoardWizardImageProgress | null): boolean {
  return !!progress && progress.total > 0 && progress.completed < progress.total;
}

export function isBoardWizardImagePreparationActive(
  progress: BoardWizardImageProgress | null,
  activeImageCount: number,
): boolean {
  return isBoardWizardImageEnrichmentActive(progress) || activeImageCount > 0;
}

export function boardWizardImageProgressLabel(
  progress: BoardWizardImageProgress | null,
  activeImageCount: number,
): string {
  if (progress && isBoardWizardImageEnrichmentActive(progress)) {
    return `Preparing images · ${progress.completed} of ${progress.total}`;
  }
  return activeImageCount === 1 ? 'Preparing image…' : 'Preparing images…';
}
