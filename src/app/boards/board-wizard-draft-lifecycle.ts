export type BoardWizardDraftLifecycleStep = 'choose' | 'configure' | 'loading' | 'preview' | 'done';

export type BoardWizardDraftLifecycleState = {
  step: BoardWizardDraftLifecycleStep;
  hasResult: boolean;
  cardCount: number;
  saving: boolean;
  restoring: boolean;
};

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
