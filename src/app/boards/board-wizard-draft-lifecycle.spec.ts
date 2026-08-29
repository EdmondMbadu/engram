import {
  boardWizardImageProgressLabel,
  boardWizardStepAfterGenerationFailure,
  isBoardWizardImageEnrichmentActive,
  isBoardWizardImagePreparationActive,
  shouldAutosaveBoardWizardDraft,
  shouldFlushBoardWizardDraftOnClose,
  shouldRetryBoardWizardDraftAutosave,
} from './board-wizard-draft-lifecycle';

describe('board wizard draft lifecycle', () => {
  it('autosaves a generated preview while preserving unpublished state', () => {
    expect(shouldAutosaveBoardWizardDraft({
      step: 'preview',
      hasResult: true,
      cardCount: 10,
      saving: false,
      restoring: false,
    })).toBeTrue();
  });

  it('does not recreate a draft after the board has been published', () => {
    expect(shouldAutosaveBoardWizardDraft({
      step: 'done',
      hasResult: true,
      cardCount: 10,
      saving: false,
      restoring: false,
    })).toBeFalse();
    expect(shouldFlushBoardWizardDraftOnClose({
      step: 'done',
      hasResult: true,
      cardCount: 10,
    })).toBeFalse();
  });

  it('flushes generated work before closing from preview or configure', () => {
    expect(shouldFlushBoardWizardDraftOnClose({
      step: 'preview',
      hasResult: true,
      cardCount: 10,
    })).toBeTrue();
    expect(shouldFlushBoardWizardDraftOnClose({
      step: 'configure',
      hasResult: true,
      cardCount: 10,
    })).toBeTrue();
  });

  it('does not persist an empty wizard', () => {
    expect(shouldAutosaveBoardWizardDraft({
      step: 'preview',
      hasResult: false,
      cardCount: 0,
      saving: false,
      restoring: false,
    })).toBeFalse();
  });

  it('returns a first-time generation failure to the configured source instead of starting over', () => {
    expect(boardWizardStepAfterGenerationFailure(false)).toBe('configure');
  });

  it('keeps an earlier preview visible when a refinement fails', () => {
    expect(boardWizardStepAfterGenerationFailure(true)).toBe('preview');
  });

  it('does not immediately replay a denied autosave for the same snapshot', () => {
    expect(shouldRetryBoardWizardDraftAutosave('snapshot-a', 'snapshot-a')).toBeFalse();
    expect(shouldRetryBoardWizardDraftAutosave('snapshot-b', 'snapshot-a')).toBeTrue();
    expect(shouldRetryBoardWizardDraftAutosave('snapshot-a', '')).toBeTrue();
  });

  it('keeps publish gated until every queued image attempt finishes', () => {
    expect(isBoardWizardImageEnrichmentActive({ completed: 7, total: 8 })).toBeTrue();
    expect(isBoardWizardImagePreparationActive({ completed: 8, total: 8 }, 0)).toBeFalse();
    expect(boardWizardImageProgressLabel({ completed: 7, total: 8 }, 0)).toBe('Preparing images · 7 of 8');
  });

  it('gates publish for a manual image retry without pretending there is a bulk queue', () => {
    expect(isBoardWizardImagePreparationActive(null, 1)).toBeTrue();
    expect(boardWizardImageProgressLabel(null, 1)).toBe('Preparing image…');
  });

  it('unlocks publish when a stopped queue has no request still active', () => {
    expect(isBoardWizardImagePreparationActive(null, 0)).toBeFalse();
  });
});
