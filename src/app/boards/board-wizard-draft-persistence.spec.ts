import {
  boardWizardDraftMediaMode,
  boardWizardDraftPayloadWithPreferences,
} from './board-wizard-draft-persistence';

describe('board wizard draft persistence contract', () => {
  it('nests optional preferences inside the established result field', () => {
    const payload = boardWizardDraftPayloadWithPreferences({
      id: 'draft-1',
      owner_user_id: 'owner-1',
      mode: 'describe',
      media_mode: 'videos',
      future_optional_preference: 'must not become a top-level field',
      result: {
        board: { title: 'Draft board' },
        cards: [{ id: 'card-1' }],
        wizard_preferences: { future_preference: 'preserve me' },
      },
    }, 'videos');

    expect(Object.prototype.hasOwnProperty.call(payload, 'media_mode')).toBeFalse();
    expect(Object.prototype.hasOwnProperty.call(payload, 'future_optional_preference')).toBeFalse();
    expect(payload.result.wizard_preferences).toEqual({
      future_preference: 'preserve me',
      media_mode: 'videos',
    });
    expect(payload.result.board).toEqual({ title: 'Draft board' });
    expect(payload.result.cards).toEqual([{ id: 'card-1' }]);
  });

  it('restores nested preferences and defaults missing or invalid values to images', () => {
    expect(boardWizardDraftMediaMode({
      result: { wizard_preferences: { media_mode: 'mixed' } },
    })).toBe('mixed');
    expect(boardWizardDraftMediaMode({ result: {} })).toBe('images');
    expect(boardWizardDraftMediaMode({
      result: { wizard_preferences: { media_mode: 'random' } },
    })).toBe('images');
  });

  it('continues reading the temporary top-level format without emitting it', () => {
    expect(boardWizardDraftMediaMode({
      media_mode: 'videos',
      result: { wizard_preferences: { media_mode: 'mixed' } },
    })).toBe('videos');
  });
});
