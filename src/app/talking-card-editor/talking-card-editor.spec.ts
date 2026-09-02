import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { AtlasItem } from '../atlas.models';
import { AtlasService } from '../atlas.service';
import { DocumentsService } from '../documents.service';
import { STACK_NARRATOR_VOICES } from '../boards/stack-voice';
import { TalkingCardDraftStore, type TalkingCardDraftRecord } from './talking-card-draft.store';
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
  const publicGlover: AtlasItem = {
    ...makeAtlas('john-glover', 'Colonel John Glover', true),
    user_id: 'public-avatar-owner',
    description: 'Marblehead commander and maritime guide',
  };
  const atlasService = {
    atlases,
    canAdminAtlas: jasmine.createSpy('canAdminAtlas').and.callFake((atlas: AtlasItem) => atlas.user_id === 'owner-1'),
    listPublicAtlases: jasmine.createSpy('listPublicAtlases').and.resolveTo([publicGlover]),
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
    updateChatGuideConfig: jasmine.createSpy('updateChatGuideConfig'),
    uploadTalkingCardAvatarImage: jasmine.createSpy('uploadTalkingCardAvatarImage').and.resolveTo('https://example.com/avatar.png'),
  };
  const draftStore = {
    load: jasmine.createSpy('load').and.resolveTo(null),
    save: jasmine.createSpy('save').and.resolveTo(),
    delete: jasmine.createSpy('delete').and.resolveTo(),
  };

  beforeEach(async () => {
    Object.values(atlasService).forEach((value) => {
      if (jasmine.isSpy(value)) value.calls.reset();
    });
    Object.values(draftStore).forEach((value) => {
      if (jasmine.isSpy(value)) value.calls.reset();
    });
    atlasService.listPublicAtlases.and.resolveTo([publicGlover]);
    draftStore.load.and.resolveTo(null);
    await TestBed.configureTestingModule({
      imports: [TalkingCardEditorComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: AtlasService, useValue: atlasService },
        { provide: DocumentsService, useValue: {} },
        { provide: TalkingCardDraftStore, useValue: draftStore },
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

  it('includes public avatars in search without allowing their voice configuration to be changed', async () => {
    const fixture = TestBed.createComponent(TalkingCardEditorComponent);
    fixture.componentRef.setInput('boardId', 'board-public-avatar');
    fixture.detectChanges();
    await draftStore.load.calls.mostRecent().returnValue;
    fixture.componentInstance.onAvatarSearchChange('glover');
    await atlasService.listPublicAtlases.calls.mostRecent().returnValue;
    await fixture.whenStable();
    fixture.detectChanges();

    const result = fixture.nativeElement.querySelector('#talking-avatar-results [role="option"]') as HTMLButtonElement;
    expect(result.textContent).toContain('Colonel John Glover');
    expect(result.textContent).toContain('Public library');
    result.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedAtlasEditable()).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('keeps the persona and voice chosen by its creator');
    await fixture.componentInstance.save();
    expect(atlasService.selectAtlasCatalogVoice).not.toHaveBeenCalled();
  });

  it('does not load the public avatar library until the user searches', async () => {
    const fixture = TestBed.createComponent(TalkingCardEditorComponent);
    fixture.componentRef.setInput('boardId', 'board-lazy-avatar-search');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(atlasService.listPublicAtlases).not.toHaveBeenCalled();

    fixture.componentInstance.onAvatarSearchChange('glover');
    await fixture.whenStable();

    expect(atlasService.listPublicAtlases).toHaveBeenCalledOnceWith(true);
    expect(fixture.componentInstance.publicAtlases()).toEqual([publicGlover]);
  });

  it('shows the full included voice catalog before the user searches', () => {
    const fixture = TestBed.createComponent(TalkingCardEditorComponent);
    fixture.detectChanges();
    fixture.componentInstance.setMode('new');
    fixture.detectChanges();

    const options = fixture.nativeElement.querySelectorAll('.talking-editor__voice-results [role="radio"]');
    const label = fixture.nativeElement.querySelector('.talking-editor__voice-library-label') as HTMLElement;

    expect(options.length).toBe(STACK_NARRATOR_VOICES.length);
    expect(options[options.length - 1].textContent).toContain(STACK_NARRATOR_VOICES.at(-1)?.name);
    expect(label.textContent).toContain(`All ${STACK_NARRATOR_VOICES.length} voices`);
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

  it('uploads a new avatar image through the user-owned avatar path', async () => {
    const fixture = TestBed.createComponent(TalkingCardEditorComponent);
    fixture.componentRef.setInput('boardId', 'board-image-upload');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.setMode('new');
    fixture.componentInstance.name.set('Colonel John Glover');
    fixture.componentInstance.personaPrompt.set('You are Colonel John Glover.');
    const image = new File(['portrait'], 'glover.png', { type: 'image/png' });
    fixture.componentInstance.imageFile.set(image);

    await fixture.componentInstance.save();

    expect(atlasService.uploadTalkingCardAvatarImage).toHaveBeenCalledWith('new-avatar', image);
    expect(atlasService.updateAtlas).toHaveBeenCalledWith('new-avatar', {
      logo_url: 'https://example.com/avatar.png',
    });
    expect(atlasService.updateChatGuideConfig).toHaveBeenCalled();
  });

  it('downscales a large portrait before previewing or uploading it', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 2400;
    canvas.height = 1600;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#315f4c';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const sourceBlob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not create test portrait.'));
    }, 'image/png'));
    const source = new File([sourceBlob], 'large-portrait.png', { type: 'image/png' });
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [source] });
    const fixture = TestBed.createComponent(TalkingCardEditorComponent);
    fixture.componentRef.setInput('boardId', 'board-large-portrait');
    fixture.detectChanges();

    await fixture.componentInstance.onImageSelected({ target: input } as unknown as Event);

    const optimized = fixture.componentInstance.imageFile();
    expect(optimized).not.toBeNull();
    expect(optimized?.type).toBe('image/webp');
    expect(optimized!.size).toBeLessThan(source.size);
    const bitmap = await createImageBitmap(optimized!);
    expect(Math.max(bitmap.width, bitmap.height)).toBe(1200);
    bitmap.close();
  });

  it('restores and saves a board-scoped local draft, including selected files', async () => {
    const image = new File(['portrait'], 'glover.png', { type: 'image/png' });
    const document = new File(['facts'], 'glover-facts.txt', { type: 'text/plain' });
    const restored: TalkingCardDraftRecord = {
      key: 'board:board-draft',
      version: 1,
      boardId: 'board-draft',
      mode: 'new',
      selectedAtlasId: '',
      createdAtlasId: 'partially-created-atlas',
      name: 'Colonel John Glover',
      role: 'Marblehead commander',
      personaPrompt: 'You are Colonel John Glover.',
      openingMessage: 'We have an army to move before daylight.',
      ctaLabel: 'Talk to Glover',
      placement: 'end',
      catalogVoiceId: '',
      voiceChoice: 'default',
      publishAvatar: false,
      imageFile: image,
      uploadedImageUrl: '',
      documentFiles: [document],
      updatedAt: '2026-08-31T00:00:00.000Z',
    };
    draftStore.load.and.resolveTo(restored);
    const fixture = TestBed.createComponent(TalkingCardEditorComponent);
    fixture.componentRef.setInput('boardId', 'board-draft');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.name()).toBe('Colonel John Glover');
    expect(fixture.componentInstance.imageFile()?.name).toBe('glover.png');
    expect(fixture.componentInstance.documentFiles()[0]?.name).toBe('glover-facts.txt');
    await fixture.componentInstance.close();

    expect(draftStore.save).toHaveBeenCalledWith(jasmine.objectContaining({
      key: 'board:board-draft',
      createdAtlasId: 'partially-created-atlas',
      name: 'Colonel John Glover',
    }));
  });
});
