import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { AuthService } from '../auth.service';
import type { AtlasItem, AtlasSpeechVoiceConfig } from '../atlas.models';
import { AtlasService } from '../atlas.service';
import { AtlasPersonaComponent } from './atlas-persona';

describe('AtlasPersonaComponent', () => {
  const atlases = signal<AtlasItem[]>([]);
  const defaultVoice: AtlasSpeechVoiceConfig = {
    source: 'default',
    provider: 'elevenlabs',
    catalogVoiceId: null,
    name: 'Default voice',
    description: null,
    previewUrl: null,
    designModel: null,
    createdAt: null,
    updatedAt: null,
  };
  const atlasService = {
    atlases,
    canAdminAtlas: jasmine.createSpy('canAdminAtlas').and.returnValue(true),
    displayName: jasmine.createSpy('displayName').and.callFake((atlas: AtlasItem) => atlas.name),
    getAtlasSpeechVoiceConfig: jasmine.createSpy('getAtlasSpeechVoiceConfig').and.resolveTo(defaultVoice),
    updatePersonaPrompt: jasmine.createSpy('updatePersonaPrompt').and.resolveTo(),
    updatePersonaSettings: jasmine.createSpy('updatePersonaSettings').and.resolveTo(),
    designAtlasSpeechVoice: jasmine.createSpy('designAtlasSpeechVoice'),
    saveAtlasDesignedVoice: jasmine.createSpy('saveAtlasDesignedVoice'),
    selectAtlasCatalogVoice: jasmine.createSpy('selectAtlasCatalogVoice'),
    resetAtlasSpeechVoice: jasmine.createSpy('resetAtlasSpeechVoice'),
    previewAtlasSpeechVoice: jasmine.createSpy('previewAtlasSpeechVoice'),
  };
  const authService = {
    isAuthenticated: signal(true),
    isAdmin: signal(false),
    profile: signal(null),
    displayName: signal('Owner'),
    email: signal('owner@example.com'),
    uid: signal('owner-1'),
    signOut: jasmine.createSpy('signOut').and.resolveTo(),
  };

  function atlas(imageUrl: string | null = null): AtlasItem {
    return {
      id: 'atlas-1',
      user_id: 'owner-1',
      name: 'George Washington',
      slug: 'george-washington',
      description: null,
      landing_summary: null,
      is_public: true,
      logo_url: '/wiki-logo.png',
      hero_url: null,
      video_url: null,
      cover_color: null,
      wiki_type: 'person',
      response_perspective: 'auto',
      persona_prompt: 'You are George Washington. Be measured, candid, and grounded in the record.',
      chat_guide: {
        name: 'George Washington',
        label: 'Your LivingWiki guide',
        banner_url: null,
        image_url: imageUrl,
      },
    };
  }

  beforeEach(async () => {
    atlases.set([atlas()]);
    Object.values(atlasService).forEach((value) => {
      if (jasmine.isSpy(value)) value.calls.reset();
    });
    atlasService.canAdminAtlas.and.returnValue(true);
    atlasService.displayName.and.callFake((item: AtlasItem) => item.name);
    atlasService.getAtlasSpeechVoiceConfig.and.resolveTo(defaultVoice);
    atlasService.updatePersonaPrompt.and.resolveTo();
    atlasService.updatePersonaSettings.and.resolveTo();

    await TestBed.configureTestingModule({
      imports: [AtlasPersonaComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map([['atlasId', 'atlas-1']]) } } },
        { provide: AtlasService, useValue: atlasService },
        { provide: AuthService, useValue: authService },
      ],
    }).compileComponents();
  });

  it('omits the guide portrait when only the wiki logo exists', async () => {
    const fixture = TestBed.createComponent(AtlasPersonaComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.setActiveStep('spoken');
    fixture.detectChanges();

    expect(fixture.componentInstance.guideImageUrl()).toBe('');
    expect(fixture.nativeElement.querySelector('aside img')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('George Washington');
  });

  it('shows the saved guide portrait when one is configured', async () => {
    atlases.set([atlas('/guide-portrait.jpg')]);
    const fixture = TestBed.createComponent(AtlasPersonaComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.setActiveStep('spoken');
    fixture.detectChanges();

    const image = fixture.nativeElement.querySelector('aside img') as HTMLImageElement;
    expect(image).not.toBeNull();
    expect(image.getAttribute('src')).toBe('/guide-portrait.jpg');
  });

  it('resolves automatic perspective by subject type and saves structured identity settings', async () => {
    const fixture = TestBed.createComponent(AtlasPersonaComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;

    expect(component.wikiTypeDraft()).toBe('person');
    expect(component.perspectiveDraft()).toBe('auto');
    expect(component.effectivePerspective()).toBe('first_person');

    component.onWikiTypeChange('city');
    expect(component.effectivePerspective()).toBe('third_person');
    component.onWikiTypeChange('person');
    component.onPerspectiveChange('third_person');
    expect(component.effectivePerspective()).toBe('third_person');

    await component.save();
    expect(atlasService.updatePersonaSettings).toHaveBeenCalledWith('atlas-1', {
      wikiType: 'person',
      responsePerspective: 'third_person',
      personaPrompt: 'You are George Washington. Be measured, candid, and grounded in the record.',
    });
  });

  it('opens both identity menus and selects options through clicks', async () => {
    const fixture = TestBed.createComponent(AtlasPersonaComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const subjectTrigger = fixture.nativeElement.querySelector('[data-testid="wiki-subject-trigger"]') as HTMLButtonElement;
    subjectTrigger.click();
    fixture.detectChanges();
    const subjectMenu = fixture.nativeElement.querySelector('[data-testid="wiki-subject-menu"]') as HTMLElement;
    expect(subjectMenu).not.toBeNull();
    (Array.from(subjectMenu.querySelectorAll('button')) as HTMLButtonElement[])
      .find((button) => button.textContent?.includes('University'))
      ?.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.wikiTypeDraft()).toBe('university');
    expect(fixture.nativeElement.querySelector('[data-testid="wiki-subject-menu"]')).toBeNull();

    const perspectiveTrigger = fixture.nativeElement.querySelector('[data-testid="speaking-perspective-trigger"]') as HTMLButtonElement;
    perspectiveTrigger.click();
    fixture.detectChanges();
    const perspectiveMenu = fixture.nativeElement.querySelector('[data-testid="speaking-perspective-menu"]') as HTMLElement;
    expect(perspectiveMenu).not.toBeNull();
    (Array.from(perspectiveMenu.querySelectorAll('button')) as HTMLButtonElement[])
      .find((button) => button.textContent?.includes('First person'))
      ?.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.perspectiveDraft()).toBe('first_person');
    expect(fixture.nativeElement.querySelector('[data-testid="speaking-perspective-menu"]')).toBeNull();
  });

  it('generates three previews and saves the selected designed voice', async () => {
    const designedVoice: AtlasSpeechVoiceConfig = {
      ...defaultVoice,
      source: 'designed',
      name: 'George Washington',
      description: 'Low, measured, dignified, warm, and quietly authoritative.',
      designModel: 'eleven_multilingual_ttv_v2',
    };
    atlasService.designAtlasSpeechVoice.and.resolveTo({
      sessionId: 'session-1',
      description: designedVoice.description!,
      previewText: 'Welcome to George Washington. Let us examine the historical record together with clarity and care.',
      previews: [1, 2, 3].map((number) => ({
        id: `generated-${number}`,
        audioBase64: 'SUQz',
        contentType: 'audio/mpeg',
        durationSeconds: 4,
        label: `Voice ${number}`,
      })),
    });
    atlasService.saveAtlasDesignedVoice.and.resolveTo(designedVoice);
    const fixture = TestBed.createComponent(AtlasPersonaComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component.setActiveStep('spoken');
    component.setVoiceMode('design');

    await component.generateVoicePreviews();
    expect(component.designPreviews().length).toBe(3);
    expect(component.selectedDesignPreviewId()).toBe('generated-1');

    await component.saveSpokenVoice();
    expect(atlasService.saveAtlasDesignedVoice).toHaveBeenCalledWith('atlas-1', 'session-1', 'generated-1');
    expect(component.speechVoiceConfig()?.source).toBe('designed');
    expect(component.spokenSavedMessage()).toContain('New voice conversations');
  });
});
