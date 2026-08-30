import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { AtlasItem } from '../atlas.models';
import { AtlasService } from '../atlas.service';
import { DocumentsService } from '../documents.service';
import { STACK_NARRATOR_VOICES } from '../boards/stack-voice';
import { TalkingCardEditorComponent } from './talking-card-editor';

describe('TalkingCardEditorComponent', () => {
  const makeAtlas = (id: string, name: string, isPublic: boolean): AtlasItem => ({
    id,
    user_id: 'owner-1',
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    description: `${name} conversational guide`,
    landing_summary: null,
    is_public: isPublic,
    logo_url: null,
    hero_url: null,
    video_url: null,
    cover_color: null,
    wiki_type: 'person',
    response_perspective: 'first_person',
    persona_prompt: null,
    chat_guide: { name, label: 'Historical guide', banner_url: null, image_url: null },
  });
  const atlases = signal<AtlasItem[]>([
    makeAtlas('george', 'George Washington', true),
    makeAtlas('james', 'James Madison', false),
    makeAtlas('philadelphia', 'Philadelphia', true),
  ]);
  const atlasService = {
    atlases,
    canAdminAtlas: jasmine.createSpy('canAdminAtlas').and.returnValue(true),
    getAtlasSpeechVoiceConfig: jasmine.createSpy('getAtlasSpeechVoiceConfig').and.resolveTo({
      source: 'default', provider: 'elevenlabs', catalogVoiceId: null, name: 'Default voice',
      description: null, previewUrl: null, designModel: null, createdAt: null, updatedAt: null,
    }),
    previewAtlasSpeechVoice: jasmine.createSpy('previewAtlasSpeechVoice').and.resolveTo({ audioUrl: 'data:audio/mpeg;base64,SUQz' }),
    selectAtlasCatalogVoice: jasmine.createSpy('selectAtlasCatalogVoice').and.resolveTo({
      source: 'catalog', provider: 'elevenlabs', catalogVoiceId: 'warm-storyteller', name: 'Warm Storyteller',
      description: null, previewUrl: null, designModel: null, createdAt: null, updatedAt: null,
    }),
    resetAtlasSpeechVoice: jasmine.createSpy('resetAtlasSpeechVoice'),
    createTalkingCardAtlas: jasmine.createSpy('createTalkingCardAtlas').and.resolveTo('new-avatar'),
    updatePersonaSettings: jasmine.createSpy('updatePersonaSettings'),
    updateAtlas: jasmine.createSpy('updateAtlas'),
  };

  beforeEach(async () => {
    Object.values(atlasService).forEach((value) => {
      if (jasmine.isSpy(value)) value.calls.reset();
    });
    await TestBed.configureTestingModule({
      imports: [TalkingCardEditorComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: AtlasService, useValue: atlasService },
        { provide: DocumentsService, useValue: {} },
      ],
    }).compileComponents();
  });

  it('searches existing avatars without rendering a long select menu', () => {
    const fixture = TestBed.createComponent(TalkingCardEditorComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#talking-avatar-search')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.talking-editor__avatar-search select')).toBeNull();

    fixture.componentInstance.avatarSearch.set('george');
    fixture.detectChanges();
    const results = fixture.nativeElement.querySelectorAll('#talking-avatar-results [role="option"]');
    expect(results.length).toBe(1);
    expect(results[0].textContent).toContain('George Washington');
  });

  it('selects a searched avatar and clears the result list', () => {
    const fixture = TestBed.createComponent(TalkingCardEditorComponent);
    fixture.detectChanges();
    fixture.componentInstance.avatarSearch.set('madison');
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('#talking-avatar-results [role="option"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedAtlasId()).toBe('james');
    expect(fixture.componentInstance.avatarSearch()).toBe('');
    expect(fixture.nativeElement.textContent).toContain('Selected avatar');
  });

  it('previews an included voice without changing the avatar selection', async () => {
    const play = spyOn(HTMLMediaElement.prototype, 'play').and.resolveTo();
    spyOn(HTMLMediaElement.prototype, 'pause');
    const fixture = TestBed.createComponent(TalkingCardEditorComponent);
    fixture.detectChanges();
    fixture.componentInstance.selectExistingAtlas('george');
    await fixture.whenStable();
    const voice = STACK_NARRATOR_VOICES[0];

    await fixture.componentInstance.toggleVoicePreview(`catalog:${voice.id}`, voice);

    expect(atlasService.previewAtlasSpeechVoice).toHaveBeenCalledWith('', voice.sampleText, voice.id);
    expect(play).toHaveBeenCalled();
    expect(fixture.componentInstance.voicePreviewPlayingKey()).toBe(`catalog:${voice.id}`);
  });

  it('saves a newly selected catalog voice to an existing avatar', async () => {
    const fixture = TestBed.createComponent(TalkingCardEditorComponent);
    fixture.detectChanges();
    fixture.componentInstance.selectExistingAtlas('george');
    await fixture.whenStable();
    const voice = STACK_NARRATOR_VOICES[0];
    fixture.componentInstance.selectCatalogVoice(voice);

    await fixture.componentInstance.save();

    expect(atlasService.selectAtlasCatalogVoice).toHaveBeenCalledWith('george', voice.id);
  });

  it('saves a selected catalog voice to a newly created avatar', async () => {
    const fixture = TestBed.createComponent(TalkingCardEditorComponent);
    fixture.detectChanges();
    fixture.componentInstance.setMode('new');
    fixture.componentInstance.name.set('Maya Chen');
    fixture.componentInstance.personaPrompt.set('You are Maya. Speak in the first person.');
    const voice = STACK_NARRATOR_VOICES[1];
    fixture.componentInstance.selectCatalogVoice(voice);

    await fixture.componentInstance.save();

    expect(atlasService.createTalkingCardAtlas).toHaveBeenCalled();
    expect(atlasService.selectAtlasCatalogVoice).toHaveBeenCalledWith('new-avatar', voice.id);
  });
});
