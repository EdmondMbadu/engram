import { Component, computed, effect, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { AuthService } from '../auth.service';
import { BusinessClaimService, type BusinessClaimWorkspaceRecord } from '../business-claim/business-claim.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { WorkspaceSidebarComponent, type WorkspaceSidebarActive } from '../workspace-sidebar/workspace-sidebar';
import { AccountMenuComponent } from '../account-menu/account-menu';

type BusinessActivityKind = 'voice' | 'chat';

@Component({
  selector: 'app-business-activity',
  imports: [RouterLink, ThemeToggleComponent, WorkspaceSidebarComponent, AccountMenuComponent],
  templateUrl: './business-activity.html',
})
export class BusinessActivityComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly title = inject(Title);
  readonly authService = inject(AuthService);
  private readonly businessClaimService = inject(BusinessClaimService);

  private readonly routeParams = toSignal(
    this.route.paramMap.pipe(map((params) => ({
      citySlug: params.get('citySlug')?.trim() || '',
      businessSlug: params.get('businessSlug')?.trim() || '',
    }))),
    { initialValue: { citySlug: '', businessSlug: '' } },
  );
  private readonly routeData = toSignal(
    this.route.data.pipe(map((data) => data['activity'] === 'voice' ? 'voice' as const : 'chat' as const)),
    { initialValue: 'chat' as BusinessActivityKind },
  );

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly business = signal<BusinessClaimWorkspaceRecord | null>(null);

  readonly activity = computed(() => this.routeData());
  readonly claimKey = computed(() => {
    const params = this.routeParams();
    return params.citySlug && params.businessSlug ? `${params.citySlug}__${params.businessSlug}` : '';
  });
  readonly detailPath = computed(() => `/business/${this.routeParams().citySlug}/${this.routeParams().businessSlug}`);
  readonly editPath = computed(() => `${this.detailPath()}/edit`);
  readonly chatPath = computed(() => `/chat/${this.routeParams().citySlug}`);
  readonly chatQueryParams = computed(() => ({ business: this.routeParams().businessSlug }));
  readonly publicChatUrl = computed(() => `https://livingwiki.com${this.chatPath()}?business=${encodeURIComponent(this.routeParams().businessSlug)}`);
  readonly businessName = computed(() => this.business()?.business_name || this.titleizeSlug(this.routeParams().businessSlug || 'business'));
  readonly cityName = computed(() => this.business()?.city_name || this.titleizeSlug(this.routeParams().citySlug || 'city'));
  readonly businessInitial = computed(() => (this.businessName().trim()[0] || 'B').toUpperCase());
  readonly ownerCanView = computed(() => !!this.authService.uid() && this.business()?.owner_user_id === this.authService.uid());
  readonly pageTitle = computed(() => this.activity() === $localize`voice` ? $localize`Voice Assistant` : $localize`Direct Chat History`);
  readonly pageEyebrow = computed(() => this.activity() === 'voice' ? 'Business voice' : 'Business chat');
  readonly pageIcon = computed(() => this.activity() === 'voice' ? 'mic' : 'forum');
  readonly sidebarActive = computed<WorkspaceSidebarActive>(() => this.activity() === 'voice' ? 'business-voice' : 'business-chat');
  readonly emptyTitle = computed(() => this.activity() === $localize`voice` ? $localize`Voice recordings will appear here.` : $localize`Visitor chat threads will appear here.`);
  readonly emptyBody = computed(() => this.activity() === 'voice'
    ? 'This placeholder is ready for recorded voice sessions, transcripts, timestamps, and playback controls once the voice provider saves business-specific audio records.'
    : 'This placeholder is ready for visitor threads, timestamps, names when available, and full conversations once chat records save the business slug or claim key.',
  );

  constructor() {
    effect(() => {
      const initialized = this.authService.initialized();
      const claimKey = this.claimKey();
      if (!initialized || !claimKey) {
        return;
      }
      void this.loadBusiness(claimKey);
    });
    effect(() => {
      this.title.setTitle(`${this.pageTitle()} | ${this.businessName()} | LivingWiki`);
    });
  }

  private async loadBusiness(claimKey: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const business = await this.businessClaimService.findWorkspaceByClaimKey(claimKey);
      this.business.set(business);
      if (!business) {
        this.loadError.set($localize`This business page has not been created yet.`);
      }
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : $localize`Could not load this business admin page.`);
    } finally {
      this.loading.set(false);
    }
  }

  private titleizeSlug(value: string): string {
    return value
      .split('-')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
}
