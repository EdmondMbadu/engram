import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { AtlasItem } from '../atlas.models';
import { AtlasService } from '../atlas.service';
import { ChatService } from '../chat.service';
import { TalkingCardConversationComponent } from './talking-card-conversation';

describe('TalkingCardConversationComponent', () => {
  const atlas: AtlasItem = {
    id: 'atlas-1',
    user_id: 'owner-1',
    name: 'George Washington',
    slug: 'george-washington',
    description: null,
    landing_summary: null,
    is_public: true,
    logo_url: null,
    hero_url: null,
    video_url: null,
    cover_color: null,
    wiki_type: 'person',
    response_perspective: 'first_person',
    persona_prompt: null,
    chat_guide: {
      name: 'George Washington',
      label: 'Your guide',
      banner_url: null,
      image_url: '/george.jpg',
    },
  };
  const atlasService = {
    getAccessibleAtlasById: jasmine.createSpy('getAccessibleAtlasById').and.resolveTo(atlas),
    canAdminAtlas: jasmine.createSpy('canAdminAtlas').and.returnValue(false),
  };
  const chatService = {
    askScoped: jasmine.createSpy('askScoped'),
    askPublic: jasmine.createSpy('askPublic'),
    createElevenLabsVoiceSession: jasmine.createSpy('createElevenLabsVoiceSession'),
    submitError: jasmine.createSpy('submitError').and.returnValue(null),
  };

  beforeEach(async () => {
    atlasService.getAccessibleAtlasById.calls.reset();
    atlasService.getAccessibleAtlasById.and.resolveTo(atlas);
    await TestBed.configureTestingModule({
      imports: [TalkingCardConversationComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: AtlasService, useValue: atlasService },
        { provide: ChatService, useValue: chatService },
      ],
    }).compileComponents();
  });

  it('opens voice mode by default and starts voice after loading the avatar', async () => {
    const fixture = TestBed.createComponent(TalkingCardConversationComponent);
    fixture.componentRef.setInput('atlasId', 'atlas-1');
    const startVoice = spyOn(fixture.componentInstance, 'startVoice').and.resolveTo();

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.conversationMode()).toBe('voice');
    expect(startVoice).toHaveBeenCalledTimes(1);
    const selectedTab = fixture.nativeElement.querySelector('[role="tab"][aria-selected="true"]') as HTMLButtonElement;
    expect(selectedTab.textContent).toContain('Voice');
    expect(fixture.nativeElement.querySelector('.talking-chat__presence')).not.toBeNull();
  });

  it('switches to text and ends an active voice session', async () => {
    const fixture = TestBed.createComponent(TalkingCardConversationComponent);
    fixture.componentRef.setInput('atlasId', 'atlas-1');
    spyOn(fixture.componentInstance, 'startVoice').and.resolveTo();
    fixture.detectChanges();
    await fixture.whenStable();
    const endVoice = spyOn(fixture.componentInstance, 'endVoice').and.resolveTo();

    await fixture.componentInstance.setConversationMode('text');
    fixture.detectChanges();

    expect(endVoice).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.conversationMode()).toBe('text');
    expect(fixture.nativeElement.querySelector('.talking-chat__text-experience')).not.toBeNull();
  });

  it('reflects actual speaking state in the ambient voice UI', async () => {
    const fixture = TestBed.createComponent(TalkingCardConversationComponent);
    fixture.componentRef.setInput('atlasId', 'atlas-1');
    spyOn(fixture.componentInstance, 'startVoice').and.resolveTo();
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.voiceStatus.set('connected');
    fixture.componentInstance.voiceMode.set('speaking');
    fixture.componentInstance.voiceEnergyLevel.set(.7);
    fixture.detectChanges();

    const presence = fixture.nativeElement.querySelector('.talking-chat__presence') as HTMLElement;
    expect(presence.classList.contains('is-speaking')).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('George Washington is speaking');
    expect(presence.style.getPropertyValue('--voice-energy')).toBe('0.7');
  });
});
