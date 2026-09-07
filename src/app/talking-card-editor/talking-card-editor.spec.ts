import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { AtlasItem } from '../atlas.models';
import { AtlasService } from '../atlas.service';
import { DocumentsService } from '../documents.service';
import { STACK_NARRATOR_VOICES } from '../boards/stack-voice';
import { TalkingCardDraftStore, type TalkingCardDraftRecord } from './talking-card-draft.store';
import { TalkingCardEditorComponent } from './talking-card-editor';
import { TalkingCardKnowledgeService } from './talking-card-knowledge.service';
import { PersonalVoiceService, type PersonalVoiceLibrary } from '../personal-voice.service';

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
  const personalLibrary: PersonalVoiceLibrary = {
    libraryVersion: 2,
    eligible: true,
    paid: false,
    admin: false,
    voiceLimit: 1,
    voiceCount: 1,
    canAddVoice: false,
    defaultVoiceId: 'voice-1',
    voice: {
      id: 'voice-1', narratorVoiceId: 'personal-voice:voice-1', name: 'Edmond', status: 'ready',
      createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
      sampleDurationSeconds: 72, voiceRevision: 1,
    },
    voices: [],
  };
  personalLibrary.voices = [personalLibrary.voice!];
  const atlasService = {
    atlases,
    canAdminAtlas: jasmine.createSpy('canAdminAtlas').and.callFake((atlas: AtlasItem) => atlas.user_id === 'owner-1'),
    isAtlasOwner: jasmine.createSpy('isAtlasOwner').and.callFake((atlas: AtlasItem) => atlas.user_id === 'owner-1'),
    getAccessibleAtlasById: jasmine.createSpy('getAccessibleAtlasById').and.callFake(async (atlasId: string) =>
      [...atlases(), publicGlover].find((atlas) => atlas.id === atlasId) ?? null),
    listPublicAtlases: jasmine.createSpy('listPublicAtlases').and.resolveTo([publicGlover]),
    getAtlasSpeechVoiceConfig: jasmine.createSpy('getAtlasSpeechVoiceConfig').and.resolveTo({
      source: 'default', provider: 'elevenlabs', catalogVoiceId: null, personalVoiceId: null, name: 'Default voice',
      description: null, previewUrl: null, designModel: null, createdAt: null, updatedAt: null,
    }),
    previewAtlasSpeechVoice: jasmine.createSpy('previewAtlasSpeechVoice').and.resolveTo({ audioUrl: 'data:audio/mpeg;base64,SUQz' }),
    selectAtlasCatalogVoice: jasmine.createSpy('selectAtlasCatalogVoice').and.resolveTo({
      source: 'catalog', provider: 'elevenlabs', catalogVoiceId: 'warm-storyteller', personalVoiceId: null, name: 'Warm Storyteller',
      description: null, previewUrl: null, designModel: null, createdAt: null, updatedAt: null,
    }),
    selectAtlasPersonalVoice: jasmine.createSpy('selectAtlasPersonalVoice').and.resolveTo({
      source: 'personal', provider: 'elevenlabs', catalogVoiceId: null, personalVoiceId: 'voice-1', name: 'Edmond',
      description: null, previewUrl: null, designModel: null, createdAt: null, updatedAt: null,
    }),
    resetAtlasSpeechVoice: jasmine.createSpy('resetAtlasSpeechVoice'),
    createTalkingCardAtlas: jasmine.createSpy('createTalkingCardAtlas').and.resolveTo('new-avatar'),
    updatePersonaSettings: jasmine.createSpy('updatePersonaSettings'),
    updatePersonaPrompt: jasmine.createSpy('updatePersonaPrompt'),
    updateAtlas: jasmine.createSpy('updateAtlas'),
    updateChatGuideConfig: jasmine.createSpy('updateChatGuideConfig'),
    uploadTalkingCardAvatarImage: jasmine.createSpy('uploadTalkingCardAvatarImage').and.resolveTo('https://example.com/avatar.png'),
  };
  const documentsService = {
    uploadError: signal<string | null>(null),
    uploadFiles: jasmine.createSpy('uploadFiles').and.resolveTo(),
    deleteDocument: jasmine.createSpy('deleteDocument').and.resolveTo(),
  };
  const talkingCardKnowledgeService = {
    listOwnedAtlasDocuments: jasmine.createSpy('listOwnedAtlasDocuments').and.resolveTo([]),
  };
  const draftStore = {
    load: jasmine.createSpy('load').and.resolveTo(null),
    save: jasmine.createSpy('save').and.resolveTo(),
    delete: jasmine.createSpy('delete').and.resolveTo(),
  };
  const personalVoiceService = {
    loadLibrary: jasmine.createSpy('loadLibrary').and.resolveTo(personalLibrary),
    createVoice: jasmine.createSpy('createVoice').and.resolveTo(personalLibrary),
    deleteVoice: jasmine.createSpy('deleteVoice').and.resolveTo({ ...personalLibrary, voices: [], voice: null }),
    renameVoice: jasmine.createSpy('renameVoice').and.resolveTo(personalLibrary),
  };
  const router = { navigate: jasmine.createSpy('navigate').and.resolveTo(true) };

  beforeEach(async () => {
    Object.values(atlasService).forEach((value) => {
      if (jasmine.isSpy(value)) value.calls.reset();
    });
    Object.values(draftStore).forEach((value) => {
      if (jasmine.isSpy(value)) value.calls.reset();
    });
    Object.values(personalVoiceService).forEach((value) => {
      if (jasmine.isSpy(value)) value.calls.reset();
    });
    Object.values(documentsService).forEach((value) => {
      if (jasmine.isSpy(value)) value.calls.reset();
    });
    talkingCardKnowledgeService.listOwnedAtlasDocuments.calls.reset();
    documentsService.uploadError.set(null);
    router.navigate.calls.reset();
    atlasService.listPublicAtlases.and.resolveTo([publicGlover]);
    draftStore.load.and.resolveTo(null);
    await TestBed.configureTestingModule({
      imports: [TalkingCardEditorComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: AtlasService, useValue: atlasService },
        { provide: DocumentsService, useValue: documentsService },
        { provide: TalkingCardKnowledgeService, useValue: talkingCardKnowledgeService },
        { provide: TalkingCardDraftStore, useValue: draftStore },
        { provide: PersonalVoiceService, useValue: personalVoiceService },
        { provide: Router, useValue: router },
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

  it('prefills the real-estate guide and isolates its draft from the generic editor', async () => {
    const fixture = TestBed.createComponent(TalkingCardEditorComponent);
    fixture.componentRef.setInput('boardId', 'listing-board');
    fixture.componentRef.setInput('prefill', {
      draftKey: 'listing-agent-setup',
      name: 'Jenny Morgan',
      role: 'North Star Realty · Listing agent',
      personaPrompt: 'Answer from the supplied property context.',
      openingMessage: 'Hi, I’m Jenny. Ask me about this home.',
      ctaLabel: 'Ask Jenny',
    });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.name()).toBe('Jenny Morgan');
    expect(fixture.componentInstance.role()).toContain('Listing agent');
    expect(fixture.componentInstance.openingMessage()).toContain('Ask me about this home');
    expect(fixture.componentInstance.ctaLabel()).toBe('Ask Jenny');
    expect(draftStore.load).toHaveBeenCalledWith('board:listing-board:listing-agent-setup');
  });

  it('shows the focused real-estate setup with the profile photo and default personal voice', async () => {
    const fixture = TestBed.createComponent(TalkingCardEditorComponent);
    fixture.componentRef.setInput('boardId', 'listing-board-focused');
    fixture.componentRef.setInput('boardTitle', '12 Garden Lane');
    fixture.componentRef.setInput('prefill', {
      experience: 'real-estate',
      draftKey: 'listing-agent-setup',
      propertyTitle: '12 Garden Lane',
      imageUrl: 'https://example.com/jenny-profile.jpg',
      contactEmail: 'jenny@example.com',
      contactPhone: '702-555-0102',
      name: 'Jenny Morgan',
      role: 'North Star Realty · Listing agent',
      personaPrompt: 'Prepared real-estate prompt.',
      openingMessage: 'Hi, I’m Jenny. Ask me about 12 Garden Lane.',
      ctaLabel: 'Ask Jenny',
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.mode()).toBe('new');
    expect(fixture.componentInstance.voiceChoice()).toBe('personal');
    expect(fixture.componentInstance.personalVoiceId()).toBe('voice-1');
    expect(fixture.componentInstance.imagePreviewUrl()).toBe('https://example.com/jenny-profile.jpg');
    expect((fixture.nativeElement.querySelector('.talking-editor__real-estate-portrait img') as HTMLImageElement).src)
      .toContain('jenny-profile.jpg');
    expect(fixture.nativeElement.textContent).toContain('Create your property guide');
    expect(fixture.nativeElement.textContent).toContain('Contact details already connected');
    expect(fixture.nativeElement.textContent).toContain('Create my Talking Card');
    expect(fixture.nativeElement.textContent).not.toContain('System prompt');
    expect(fixture.nativeElement.querySelector('.talking-editor__tabs')).toBeNull();
  });

  it('reuses an owned agent avatar without replacing its saved voice with the personal default', async () => {
    const fixture = TestBed.createComponent(TalkingCardEditorComponent);
    fixture.componentRef.setInput('boardId', 'listing-board-reuse');
    fixture.componentRef.setInput('prefill', {
      experience: 'real-estate',
      draftKey: 'listing-agent-setup',
      preferredAtlasId: 'george',
      imageUrl: 'https://example.com/profile-fallback.jpg',
      name: 'George Washington',
      role: 'Listing agent',
      personaPrompt: 'Prepared real-estate prompt.',
      openingMessage: 'Ask me about this property.',
    });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.mode()).toBe('existing');
    expect(fixture.componentInstance.selectedAtlasId()).toBe('george');
    expect(fixture.componentInstance.voiceChoice()).toBe('default');
    expect(fixture.componentInstance.imagePreviewUrl()).toBe('https://example.com/profile-fallback.jpg');
  });

  it('turns the optional showing URL into one concise scheduling action', async () => {
    const fixture = TestBed.createComponent(TalkingCardEditorComponent);
    fixture.componentRef.setInput('boardId', 'listing-board-scheduling');
    fixture.componentRef.setInput('prefill', {
      experience: 'real-estate',
      draftKey: 'listing-agent-setup',
      name: 'Jenny Morgan',
      personaPrompt: 'Prepared real-estate prompt.',
      openingMessage: 'Ask me about this property.',
    });
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.updateRealEstateScheduleUrl('https://cal.example.com/jenny');
    expect(fixture.componentInstance.actions()).toEqual([jasmine.objectContaining({
      kind: 'schedule',
      label: 'Schedule a showing',
      url: 'https://cal.example.com/jenny',
    })]);
    fixture.componentInstance.updateRealEstateScheduleUrl('');
    expect(fixture.componentInstance.actions()).toEqual([]);
  });

  it('creates the real-estate guide with its prepared prompt, profile photo, and personal voice', async () => {
    const fixture = TestBed.createComponent(TalkingCardEditorComponent);
    fixture.componentRef.setInput('boardId', 'listing-board-save');
    fixture.componentRef.setInput('prefill', {
      experience: 'real-estate',
      draftKey: 'listing-agent-setup',
      imageUrl: 'https://example.com/jenny-profile.jpg',
      name: 'Jenny Morgan',
      role: 'North Star Realty · Listing agent',
      personaPrompt: 'Prepared real-estate prompt with property safeguards.',
      openingMessage: 'Hi, I’m Jenny. Ask me about this home.',
      ctaLabel: 'Ask Jenny',
    });
    const saved = spyOn(fixture.componentInstance.saved, 'emit');
    fixture.detectChanges();
    await fixture.whenStable();

    await fixture.componentInstance.save();

    expect(atlasService.createTalkingCardAtlas).toHaveBeenCalledOnceWith({
      name: 'Jenny Morgan',
      role: 'North Star Realty · Listing agent',
      personaPrompt: 'Prepared real-estate prompt with property safeguards.',
      isPublic: false,
    });
    expect(atlasService.updateAtlas).toHaveBeenCalledWith('new-avatar', {
      logo_url: 'https://example.com/jenny-profile.jpg',
    });
    expect(atlasService.selectAtlasPersonalVoice).toHaveBeenCalledWith('new-avatar', 'voice-1');
    expect(saved).toHaveBeenCalledWith(jasmine.objectContaining({
      atlasId: 'new-avatar',
      title: 'Jenny Morgan',
      imageUrl: 'https://example.com/jenny-profile.jpg',
      personaPrompt: 'Prepared real-estate prompt with property safeguards.',
      ctaLabel: 'Ask Jenny',
      placement: 'end',
    }));
  });

  it('cleans malformed generated agency copy from a restored real-estate draft', async () => {
    draftStore.load.and.resolveTo({
      key: 'board:listing-board-legacy-draft:listing-agent-setup',
      version: 1,
      boardId: 'listing-board-legacy-draft',
      mode: 'new',
      selectedAtlasId: '',
      createdAtlasId: '',
      name: 'Edmond Mbadu',
      role: 'Edmond Mbadu Executive Realty Services Phone: · Listing agent',
      personaPrompt: 'Old prompt.',
      openingMessage: 'Ask me about this property.',
      ctaLabel: 'Ask Edmond',
      placement: 'end',
      actions: [],
      catalogVoiceId: '',
      personalVoiceId: '',
      voiceChoice: 'default',
      publishAvatar: false,
      imageFile: null,
      uploadedImageUrl: '',
      documentFiles: [],
      updatedAt: '2026-09-07T00:00:00.000Z',
    });
    const fixture = TestBed.createComponent(TalkingCardEditorComponent);
    fixture.componentRef.setInput('boardId', 'listing-board-legacy-draft');
    fixture.componentRef.setInput('prefill', {
      experience: 'real-estate',
      draftKey: 'listing-agent-setup',
      name: 'Edmond Mbadu',
      role: 'Executive Realty Services · Listing agent',
      personaPrompt: 'Prepared prompt.',
      openingMessage: 'Ask me about this property.',
    });

    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.role()).toBe('Executive Realty Services · Listing agent');
    expect(fixture.componentInstance.personaPrompt()).toContain('Executive Realty Services');
    expect(fixture.componentInstance.personaPrompt()).not.toContain('Phone:');
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

  it('loads My voices and shows the server-authoritative free account limit', async () => {
    const fixture = TestBed.createComponent(TalkingCardEditorComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.setMode('new');
    fixture.detectChanges();

    expect(personalVoiceService.loadLibrary).toHaveBeenCalled();
    expect(fixture.componentInstance.personalVoices()).toEqual(personalLibrary.voices);
    expect(fixture.nativeElement.querySelector('.talking-editor__personal-library').textContent).toContain('1 of 1');
    expect(fixture.nativeElement.querySelector('.talking-editor__personal-add').textContent).toContain('Upgrade');
  });

  it('previews a personal voice through its authenticated narrator id', async () => {
    spyOn(HTMLMediaElement.prototype, 'play').and.resolveTo();
    spyOn(HTMLMediaElement.prototype, 'pause');
    const fixture = TestBed.createComponent(TalkingCardEditorComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const voice = personalLibrary.voices[0];

    await fixture.componentInstance.toggleVoicePreview(
      `personal:${voice.id}:${voice.voiceRevision}`,
      undefined,
      voice.narratorVoiceId,
    );

    expect(atlasService.previewAtlasSpeechVoice).toHaveBeenCalledWith(
      '',
      jasmine.stringContaining('LivingWiki guide'),
      'personal-voice:voice-1',
    );
  });

  it('saves a personal voice to an existing editable avatar', async () => {
    const fixture = TestBed.createComponent(TalkingCardEditorComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.selectExistingAtlas('george');
    await fixture.whenStable();
    fixture.componentInstance.selectPersonalVoice(personalLibrary.voices[0]);

    await fixture.componentInstance.save();

    expect(atlasService.selectAtlasPersonalVoice).toHaveBeenCalledWith('george', 'voice-1');
  });

  it('saves a personal voice after creating a new avatar', async () => {
    const fixture = TestBed.createComponent(TalkingCardEditorComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.setMode('new');
    fixture.componentInstance.name.set('Maya Chen');
    fixture.componentInstance.personaPrompt.set('You are Maya.');
    fixture.componentInstance.selectPersonalVoice(personalLibrary.voices[0]);

    await fixture.componentInstance.save();

    expect(atlasService.createTalkingCardAtlas).toHaveBeenCalled();
    expect(atlasService.selectAtlasPersonalVoice).toHaveBeenCalledWith('new-avatar', 'voice-1');
  });

  it('routes a full free voice library to upgrade while replacement remains available', async () => {
    const fixture = TestBed.createComponent(TalkingCardEditorComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.openPersonalVoiceSetup();
    expect(router.navigate).toHaveBeenCalledWith(['/pricing'], { queryParams: { feature: 'personal-voice' } });

    fixture.componentInstance.openPersonalVoiceSetup(personalLibrary.voices[0]);
    expect(fixture.componentInstance.personalVoiceSetupOpen()).toBeTrue();
    expect(fixture.componentInstance.personalVoiceSetupVoiceId()).toBe('voice-1');
  });

  it('replaces a personal voice through the shared Stack Studio voice service', async () => {
    const fixture = TestBed.createComponent(TalkingCardEditorComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const voice = personalLibrary.voices[0];
    const recording = new File(['recording'], 'voice.webm', { type: 'audio/webm' });
    fixture.componentInstance.openPersonalVoiceSetup(voice);
    fixture.componentInstance.personalVoiceFile.set(recording);
    fixture.componentInstance.personalVoiceDurationSeconds.set(72);
    fixture.componentInstance.personalVoiceOwnVoiceConfirmed.set(true);
    fixture.componentInstance.personalVoiceConsentConfirmed.set(true);

    await fixture.componentInstance.createPersonalVoice();

    expect(personalVoiceService.createVoice).toHaveBeenCalledWith({
      file: recording,
      durationSeconds: 72,
      name: 'Edmond',
      replacingVoiceId: 'voice-1',
    });
    expect(fixture.componentInstance.voiceChoice()).toBe('personal');
    expect(fixture.componentInstance.personalVoiceId()).toBe('voice-1');
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
      actions: [{ id: 'schedule-1', kind: 'schedule', label: 'Book a tour', url: 'https://cal.com/glover' }],
      catalogVoiceId: '',
      personalVoiceId: 'voice-1',
      voiceChoice: 'personal',
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
    expect(fixture.componentInstance.voiceChoice()).toBe('personal');
    expect(fixture.componentInstance.personalVoiceId()).toBe('voice-1');
    expect(fixture.componentInstance.actions()[0]?.url).toBe('https://cal.com/glover');
    await fixture.componentInstance.close();

    expect(draftStore.save).toHaveBeenCalledWith(jasmine.objectContaining({
      key: 'board:board-draft',
      createdAtlasId: 'partially-created-atlas',
      name: 'Colonel John Glover',
      personalVoiceId: 'voice-1',
      voiceChoice: 'personal',
      actions: [jasmine.objectContaining({ kind: 'schedule', url: 'https://cal.com/glover' })],
    }));
  });

  it('edits the card presentation, shared persona, and conversation actions in one flow', async () => {
    const fixture = TestBed.createComponent(TalkingCardEditorComponent);
    fixture.componentRef.setInput('boardId', 'board-edit');
    fixture.componentRef.setInput('editingCard', {
      id: 'card-1',
      title: 'George Washington',
      subtitle: 'Historical guide',
      imageUrl: 'https://example.com/george.png',
      placement: 'keep',
      conversation: {
        version: 1,
        provider: 'atlas',
        atlasId: 'george',
        openingMessage: 'Welcome to Mount Vernon.',
        ctaLabel: 'Talk to George',
        actions: [{
          id: 'schedule-1',
          kind: 'schedule',
          label: 'Book a tour',
          url: 'https://cal.com/mount-vernon',
          description: 'Choose a time for a private tour.',
        }],
      },
    });
    let emitted: unknown;
    fixture.componentInstance.saved.subscribe((value) => { emitted = value; });
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Edit Talking Card');
    expect(fixture.componentInstance.name()).toBe('George Washington');
    expect(talkingCardKnowledgeService.listOwnedAtlasDocuments).toHaveBeenCalledOnceWith('george');

    fixture.componentInstance.name.set('George at Mount Vernon');
    fixture.componentInstance.personaPrompt.set('Answer as George Washington and cite the supplied documents.');
    fixture.componentInstance.updateAction(0, 'label', 'Schedule a private tour');
    fixture.componentInstance.addAction('link');
    fixture.componentInstance.updateAction(1, 'label', 'View the property guide');
    fixture.componentInstance.updateAction(1, 'url', 'https://example.com/property-guide');

    await fixture.componentInstance.save();

    expect(atlasService.updatePersonaPrompt).toHaveBeenCalledWith(
      'george',
      'Answer as George Washington and cite the supplied documents.',
    );
    expect(atlasService.updateChatGuideConfig).toHaveBeenCalled();
    expect(emitted).toEqual(jasmine.objectContaining({
      cardId: 'card-1',
      atlasId: 'george',
      title: 'George at Mount Vernon',
      placement: 'keep',
      actions: [
        jasmine.objectContaining({ kind: 'schedule', label: 'Schedule a private tour' }),
        jasmine.objectContaining({ kind: 'link', url: 'https://example.com/property-guide' }),
      ],
    }));
  });

  it('keeps a public library avatar locked while allowing card-only presentation and actions', async () => {
    const fixture = TestBed.createComponent(TalkingCardEditorComponent);
    fixture.componentRef.setInput('editingCard', {
      id: 'card-public',
      title: 'Colonel John Glover',
      subtitle: 'Marblehead commander',
      imageUrl: '',
      placement: 'keep',
      conversation: {
        version: 1,
        provider: 'atlas',
        atlasId: publicGlover.id,
        openingMessage: 'How can I help?',
        ctaLabel: 'Talk to Glover',
      },
    });
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.componentInstance.setEditorSection('knowledge');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('avatar creator manages its system prompt and knowledge');
    expect(talkingCardKnowledgeService.listOwnedAtlasDocuments).not.toHaveBeenCalled();

    await fixture.componentInstance.save();

    expect(atlasService.updatePersonaPrompt).not.toHaveBeenCalled();
    expect(atlasService.updateChatGuideConfig).not.toHaveBeenCalled();
  });

  it('presents the full avatar deep editor when editing a Talking Card', async () => {
    const fixture = TestBed.createComponent(TalkingCardEditorComponent);
    fixture.componentRef.setInput('editingCard', {
      id: 'listing-guide-card',
      title: 'Jenny Morgan',
      subtitle: 'North Star Realty · Listing agent',
      imageUrl: 'https://example.com/jenny.jpg',
      placement: 'keep',
      conversation: {
        version: 1,
        provider: 'atlas',
        atlasId: 'george',
        openingMessage: 'Ask me about this home.',
        ctaLabel: 'Ask Jenny',
      },
    });
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Edit Talking Card & avatar');
    expect(fixture.nativeElement.textContent).toContain('Deep-edit the card, avatar prompt, documents, voice, and visitor actions.');
    const tabs = Array.from(fixture.nativeElement.querySelectorAll('[role="tab"]'))
      .map((element: unknown) => (element as HTMLElement).textContent?.trim());
    expect(tabs).toEqual(['Card', 'Prompt & documents', 'Voice', 'Actions']);

    fixture.componentInstance.setEditorSection('knowledge');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Avatar prompt & documents');
    expect(fixture.nativeElement.textContent).toContain('System prompt');
    expect(fixture.nativeElement.textContent).toContain('Knowledge documents');
    expect(talkingCardKnowledgeService.listOwnedAtlasDocuments).toHaveBeenCalledWith('george');
  });
});
