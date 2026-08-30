import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { AtlasItem } from '../atlas.models';
import { AtlasService } from '../atlas.service';
import { DocumentsService } from '../documents.service';
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
  };

  beforeEach(async () => {
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
});
