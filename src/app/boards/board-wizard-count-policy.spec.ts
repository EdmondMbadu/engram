import {
  inferBoardWizardPromptCount,
  isBoardWizardCompleteSetRequest,
  resolveBoardWizardCountIntent,
} from './board-wizard-count-policy';

describe('board wizard count policy', () => {
  it('uses the default target when the request does not state a scope', () => {
    expect(resolveBoardWizardCountIntent({ prompt: 'A board about Constitution signers', targetCount: 12 }))
      .toEqual({ policy: 'target-count', count: 12 });
  });

  it('lets an explicit prompt count override the untouched slider', () => {
    expect(inferBoardWizardPromptCount('Create the top 20 museums')).toBe(20);
    expect(resolveBoardWizardCountIntent({ prompt: 'Create the top 20 museums', targetCount: 12 }))
      .toEqual({ policy: 'prompt-exact', count: 20 });
  });

  it('recognizes a closed complete set without treating curated lists as complete', () => {
    expect(isBoardWizardCompleteSetRequest('List all the people who signed the US Constitution')).toBeTrue();
    expect(isBoardWizardCompleteSetRequest('Find all interesting places in America')).toBeFalse();
    expect(resolveBoardWizardCountIntent({
      prompt: 'List all the people who signed the US Constitution',
      targetCount: 12,
    })).toEqual({ policy: 'complete-set', count: null });
  });

  it('honors structured sources and an intentional manual limit', () => {
    expect(resolveBoardWizardCountIntent({ prompt: 'all members', sourceCount: 17, targetCount: 12 }))
      .toEqual({ policy: 'source-exact', count: 17 });
    expect(resolveBoardWizardCountIntent({
      prompt: 'all members', countMode: 'fixed', targetCount: 10,
    })).toEqual({ policy: 'target-count', count: 10 });
  });
});

