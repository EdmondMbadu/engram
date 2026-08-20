import { convertToParamMap } from '@angular/router';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from '../auth.service';
import { BoardAnalyticsService, type BoardInsights } from '../board-analytics.service';
import { BoardInsightsComponent } from './board-insights';

describe('BoardInsightsComponent', () => {
  const paramMap = new BehaviorSubject(convertToParamMap({ boardId: 'board-1' }));
  const report: BoardInsights = {
    board: { id: 'board-1', title: 'Cape May Gems', customSlug: 'cape-may-gems', visibility: 'public' },
    range: { days: 30, from: '2026-07-21', to: '2026-08-19' },
    totals: {
      views: 120,
      uniqueVisitors: 94,
      engagedVisits: 60,
      cardOpens: 42,
      outboundClicks: 18,
      shares: 4,
      customLinkCopies: 3,
    },
    daily: [{
      day: '2026-08-19', views: 120, uniqueVisitors: 94, engagedVisits: 60,
      cardOpens: 42, outboundClicks: 18, shares: 4, customLinkCopies: 3,
    }],
    sources: [{ source: 'facebook', views: 80 }, { source: 'direct', views: 40 }],
    campaigns: [{ campaign: 'cape-may-group', views: 70 }],
    cards: [{ cardId: 'card-1', title: 'Sunset Beach', opens: 20, outboundClicks: 8 }],
    lastUpdatedAt: '2026-08-19T18:00:00.000Z',
    definitions: {
      uniqueVisitors: 'Daily unique browsers summed across the selected period.',
      engagedVisits: 'Visits with at least ten seconds of attention or a board interaction.',
    },
  };
  const analytics = {
    getInsights: jasmine.createSpy('getInsights').and.resolveTo(report),
  };
  const auth = { waitForReady: jasmine.createSpy('waitForReady').and.resolveTo() };

  beforeEach(async () => {
    analytics.getInsights.calls.reset();
    await TestBed.configureTestingModule({
      imports: [BoardInsightsComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap } },
        { provide: BoardAnalyticsService, useValue: analytics },
        { provide: AuthService, useValue: auth },
      ],
    }).compileComponents();
  });

  it('renders the owner dashboard from the reporting API', async () => {
    const fixture = TestBed.createComponent(BoardInsightsComponent);
    fixture.detectChanges();
    await fixture.componentInstance['load']();
    fixture.detectChanges();

    expect(analytics.getInsights).toHaveBeenCalledWith('board-1', 30);
    expect(fixture.nativeElement.textContent).toContain('Cape May Gems');
    expect(fixture.nativeElement.textContent).toContain('120');
    expect(fixture.nativeElement.textContent).toContain('Facebook');
    expect(fixture.nativeElement.textContent).toContain('Sunset Beach');
    expect(fixture.componentInstance.trackedUrl()).toContain('utm_source=facebook');
    expect(fixture.componentInstance.dailyYAxisTicks()).toEqual([120, 90, 60, 30, 0]);
    expect(fixture.nativeElement.querySelector('.trend-y-axis').textContent).toContain('90');
    expect(fixture.nativeElement.querySelector('.insights-bar').getAttribute('aria-label')).toContain('120 views');
    expect(fixture.nativeElement.querySelector('.insights-bar__tooltip').textContent).toContain('120 views');
    expect(fixture.nativeElement.querySelector('textarea[aria-label="Tracked board URL"]').value)
      .toContain('/boards/cape-may-gems?utm_source=facebook&utm_medium=social');
    expect(fixture.nativeElement.textContent).toContain('Choose where you will share it');
    expect(fixture.nativeElement.textContent).toContain('Campaign results');
  });

  it('updates the attribution medium when the share source changes', async () => {
    const fixture = TestBed.createComponent(BoardInsightsComponent);
    fixture.detectChanges();
    await fixture.componentInstance['load']();
    fixture.componentInstance.setSource('email');
    fixture.detectChanges();

    expect(fixture.componentInstance.trackedUrl()).toContain('utm_source=email');
    expect(fixture.componentInstance.trackedUrl()).toContain('utm_medium=newsletter');
    expect(fixture.nativeElement.textContent).toContain('Campaigns and personal email');
  });
});
