import { Component, ElementRef, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { AuthService } from '../auth.service';
import { buildBusinessBadgeSvg } from '../business-badge';
import { BusinessClaimService, type BusinessClaimWorkspaceRecord } from '../business-claim/business-claim.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { WorkspaceSidebarComponent } from '../workspace-sidebar/workspace-sidebar';

type BusinessLanguage = {
  country: string;
  flag: string;
  language: string;
  code: string;
  greeting: string;
};

const BUSINESS_LANGUAGES: BusinessLanguage[] = [
  { country: 'Argentina', flag: '🇦🇷', language: 'Español', code: 'es', greeting: '¡Hola! ¿Cómo puedo ayudarle hoy?' },
  { country: 'Algeria', flag: '🇩🇿', language: 'العربية', code: 'ar', greeting: 'مرحباً! كيف يمكنني مساعدتك اليوم؟' },
  { country: 'Australia', flag: '🇦🇺', language: 'English', code: 'en', greeting: 'Hello! How can I help you today?' },
  { country: 'Austria', flag: '🇦🇹', language: 'Deutsch', code: 'de', greeting: 'Hallo! Wie kann ich Ihnen heute helfen?' },
  { country: 'Belgium', flag: '🇧🇪', language: 'Français', code: 'fr', greeting: 'Bonjour ! Comment puis-je vous aider aujourd’hui ?' },
  { country: 'Bosnia & Herzegovina', flag: '🇧🇦', language: 'Bosanski', code: 'hr', greeting: 'Zdravo! Kako vam mogu pomoći danas?' },
  { country: 'Brazil', flag: '🇧🇷', language: 'Português', code: 'pt-br', greeting: 'Olá! Como posso ajudar hoje?' },
  { country: 'Canada', flag: '🇨🇦', language: 'English', code: 'en', greeting: 'Hello! How can I help you today?' },
  { country: 'Cape Verde', flag: '🇨🇻', language: 'Português', code: 'pt', greeting: 'Olá! Como posso ajudar hoje?' },
  { country: 'Colombia', flag: '🇨🇴', language: 'Español', code: 'es', greeting: '¡Hola! ¿Cómo puedo ayudarle hoy?' },
  { country: 'Croatia', flag: '🇭🇷', language: 'Hrvatski', code: 'hr', greeting: 'Bok! Kako mogu pomoći danas?' },
  { country: 'Curaçao', flag: '🇨🇼', language: 'Nederlands', code: 'nl', greeting: 'Hallo! Waarmee kan ik helpen?' },
  { country: 'Czechia', flag: '🇨🇿', language: 'Čeština', code: 'cs', greeting: 'Ahoj! Jak vám mohu pomoci?' },
  { country: 'DR Congo', flag: '🇨🇩', language: 'Français', code: 'fr', greeting: 'Bonjour ! Comment puis-je vous aider aujourd’hui ?' },
  { country: 'Ecuador', flag: '🇪🇨', language: 'Español', code: 'es', greeting: '¡Hola! ¿Cómo puedo ayudarle hoy?' },
  { country: 'Egypt', flag: '🇪🇬', language: 'العربية', code: 'ar', greeting: 'مرحباً! كيف يمكنني مساعدتك اليوم؟' },
  { country: 'England', flag: '🏴', language: 'English', code: 'en', greeting: 'Hello! How can I help you today?' },
  { country: 'France', flag: '🇫🇷', language: 'Français', code: 'fr', greeting: 'Bonjour ! Comment puis-je vous aider aujourd’hui ?' },
  { country: 'Germany', flag: '🇩🇪', language: 'Deutsch', code: 'de', greeting: 'Hallo! Wie kann ich Ihnen heute helfen?' },
  { country: 'Ghana', flag: '🇬🇭', language: 'English', code: 'en', greeting: 'Hello! How can I help you today?' },
  { country: 'Haiti', flag: '🇭🇹', language: 'Français', code: 'fr', greeting: 'Bonjour ! Comment puis-je vous aider aujourd’hui ?' },
  { country: 'Iran', flag: '🇮🇷', language: 'فارسی', code: 'fa', greeting: 'سلام! امروز چطور می‌توانم کمک کنم؟' },
  { country: 'Iraq', flag: '🇮🇶', language: 'العربية', code: 'ar', greeting: 'مرحباً! كيف يمكنني مساعدتك اليوم؟' },
  { country: 'Ivory Coast', flag: '🇨🇮', language: 'Français', code: 'fr', greeting: 'Bonjour ! Comment puis-je vous aider aujourd’hui ?' },
  { country: 'Japan', flag: '🇯🇵', language: '日本語', code: 'ja', greeting: 'こんにちは。本日はどのようにお手伝いできますか？' },
  { country: 'Jordan', flag: '🇯🇴', language: 'العربية', code: 'ar', greeting: 'مرحباً! كيف يمكنني مساعدتك اليوم؟' },
  { country: 'Mexico', flag: '🇲🇽', language: 'Español', code: 'es', greeting: '¡Hola! ¿Cómo puedo ayudarle hoy?' },
  { country: 'Morocco', flag: '🇲🇦', language: 'العربية', code: 'ar', greeting: 'مرحباً! كيف يمكنني مساعدتك اليوم؟' },
  { country: 'Netherlands', flag: '🇳🇱', language: 'Nederlands', code: 'nl', greeting: 'Hallo! Waarmee kan ik helpen?' },
  { country: 'New Zealand', flag: '🇳🇿', language: 'English', code: 'en', greeting: 'Hello! How can I help you today?' },
  { country: 'Norway', flag: '🇳🇴', language: 'Norsk', code: 'no', greeting: 'Hei! Hvordan kan jeg hjelpe deg i dag?' },
  { country: 'Panama', flag: '🇵🇦', language: 'Español', code: 'es', greeting: '¡Hola! ¿Cómo puedo ayudarle hoy?' },
  { country: 'Paraguay', flag: '🇵🇾', language: 'Español', code: 'es', greeting: '¡Hola! ¿Cómo puedo ayudarle hoy?' },
  { country: 'Portugal', flag: '🇵🇹', language: 'Português', code: 'pt', greeting: 'Olá! Como posso ajudar hoje?' },
  { country: 'Qatar', flag: '🇶🇦', language: 'العربية', code: 'ar', greeting: 'مرحباً! كيف يمكنني مساعدتك اليوم؟' },
  { country: 'Saudi Arabia', flag: '🇸🇦', language: 'العربية', code: 'ar', greeting: 'مرحباً! كيف يمكنني مساعدتك اليوم؟' },
  { country: 'Scotland', flag: '🏴', language: 'English', code: 'en', greeting: 'Hello! How can I help you today?' },
  { country: 'Senegal', flag: '🇸🇳', language: 'Français', code: 'fr', greeting: 'Bonjour ! Comment puis-je vous aider aujourd’hui ?' },
  { country: 'South Africa', flag: '🇿🇦', language: 'English', code: 'en', greeting: 'Hello! How can I help you today?' },
  { country: 'South Korea', flag: '🇰🇷', language: '한국어', code: 'ko', greeting: '안녕하세요. 오늘 무엇을 도와드릴까요?' },
  { country: 'Spain', flag: '🇪🇸', language: 'Español', code: 'es', greeting: '¡Hola! ¿Cómo puedo ayudarle hoy?' },
  { country: 'Sweden', flag: '🇸🇪', language: 'Svenska', code: 'sv', greeting: 'Hej! Hur kan jag hjälpa dig idag?' },
  { country: 'Switzerland', flag: '🇨🇭', language: 'Deutsch', code: 'de', greeting: 'Hallo! Wie kann ich Ihnen heute helfen?' },
  { country: 'Tunisia', flag: '🇹🇳', language: 'العربية', code: 'ar', greeting: 'مرحباً! كيف يمكنني مساعدتك اليوم؟' },
  { country: 'Türkiye', flag: '🇹🇷', language: 'Türkçe', code: 'tr', greeting: 'Merhaba! Bugün size nasıl yardımcı olabilirim?' },
  { country: 'Uruguay', flag: '🇺🇾', language: 'Español', code: 'es', greeting: '¡Hola! ¿Cómo puedo ayudarle hoy?' },
  { country: 'United States', flag: '🇺🇸', language: 'English', code: 'en', greeting: 'Hello! How can I help you today?' },
  { country: 'Uzbekistan', flag: '🇺🇿', language: 'Русский', code: 'ru', greeting: 'Здравствуйте! Чем я могу помочь сегодня?' },
  { country: 'China', flag: '🇨🇳', language: '中文（普通话）', code: 'zh', greeting: '您好！今天我能帮您什么？' },
  { country: 'Russia', flag: '🇷🇺', language: 'Русский', code: 'ru', greeting: 'Здравствуйте! Чем я могу помочь сегодня?' },
  { country: 'India', flag: '🇮🇳', language: 'हिन्दी', code: 'hi', greeting: 'नमस्ते! आज मैं आपकी क्या मदद कर सकता हूँ?' },
];

@Component({
  selector: 'app-business-detail',
  imports: [RouterLink, ThemeToggleComponent, WorkspaceSidebarComponent],
  templateUrl: './business-detail.html',
  styleUrl: './business-detail.css',
})
export class BusinessDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  readonly authService = inject(AuthService);
  private readonly businessClaimService = inject(BusinessClaimService);

  @ViewChild('languageTrack') languageTrack?: ElementRef<HTMLElement>;

  private readonly routeParams = toSignal(
    this.route.paramMap.pipe(map((params) => ({
      citySlug: params.get('citySlug')?.trim() || '',
      businessSlug: params.get('businessSlug')?.trim() || '',
    }))),
    { initialValue: { citySlug: '', businessSlug: '' } },
  );

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly business = signal<BusinessClaimWorkspaceRecord | null>(null);
  readonly languageSearch = signal('');
  readonly selectedLanguage = signal<BusinessLanguage>(this.defaultLanguage());
  readonly languageAtStart = signal(true);
  readonly languageAtEnd = signal(false);
  readonly copiedLink = signal(false);
  readonly copiedGuideLink = signal(false);

  readonly claimKey = computed(() => {
    const params = this.routeParams();
    return params.citySlug && params.businessSlug ? `${params.citySlug}__${params.businessSlug}` : '';
  });
  readonly fallbackBusinessName = computed(() => this.titleizeSlug(this.routeParams().businessSlug || 'business'));
  readonly fallbackCityName = computed(() => this.titleizeSlug(this.routeParams().citySlug || 'city'));
  readonly businessName = computed(() => this.business()?.business_name || this.fallbackBusinessName());
  readonly cityName = computed(() => this.business()?.city_name || this.fallbackCityName());
  readonly businessInitial = computed(() => (this.businessName().trim()[0] || 'B').toUpperCase());
  readonly statusLabel = computed(() => this.business()?.status === 'pending' ? 'Pending' : 'Live');
  readonly ownerCanViewPrivateDetails = computed(() => !!this.authService.uid() && this.business()?.owner_user_id === this.authService.uid());
  readonly showWorkspaceSidebar = computed(() => this.authService.isAuthenticated() && !this.loading() && !this.ownerCanViewPrivateDetails());
  readonly showAnySidebar = computed(() => this.ownerCanViewPrivateDetails() || this.showWorkspaceSidebar());
  readonly detailPath = computed(() => `/business/${this.routeParams().citySlug}/${this.routeParams().businessSlug}`);
  readonly chatPath = computed(() => `/chat/${this.routeParams().citySlug}`);
  readonly chatQueryParams = computed(() => ({ business: this.routeParams().businessSlug }));
  readonly chatUrl = computed(() => `${this.origin()}${this.chatPath()}?business=${encodeURIComponent(this.routeParams().businessSlug)}`);
  readonly publicChatUrl = computed(() => `https://mylivingwiki.com${this.chatPath()}?business=${encodeURIComponent(this.routeParams().businessSlug)}`);
  readonly detailUrl = computed(() => `${this.origin()}${this.detailPath()}`);
  readonly voiceAdminPath = computed(() => `${this.detailPath()}/voice`);
  readonly chatAdminPath = computed(() => `${this.detailPath()}/chat`);
  readonly badgeIconCodes = computed(() => this.business()?.badge_icons?.filter((icon): icon is string => typeof icon === 'string').slice(0, 3) ?? []);
  readonly badgeSvg = computed(() => buildBusinessBadgeSvg({
    businessName: this.businessName(),
    chatUrl: this.publicChatUrl(),
    iconCodes: this.badgeIconCodes(),
  }));
  readonly badgeSvgHref = computed(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(this.badgeSvg())}`);
  readonly badgeSvgFilename = computed(() => `${this.routeParams().businessSlug || 'business'}-${this.routeParams().citySlug || 'city'}-badge.svg`);
  readonly badgePngFilename = computed(() => `${this.routeParams().businessSlug || 'business'}-${this.routeParams().citySlug || 'city'}-badge.png`);
  readonly contactEmail = computed(() => this.ownerCanViewPrivateDetails() ? this.business()?.admin_email?.trim() || '' : '');
  readonly guidePrompt = computed(() => this.business()?.guide_prompt?.trim() || '');
  readonly logoUrl = computed(() => this.business()?.logo_url?.trim() || '');
  readonly profileImageUrl = computed(() => this.business()?.profile_image_url?.trim() || '');
  readonly coverImageUrl = computed(() => this.business()?.cover_image_url?.trim() || '');
  readonly editPath = computed(() => `${this.detailPath()}/edit`);
  readonly aboutText = computed(() =>
    this.guidePrompt()
      || `${this.businessName()} is a local ${this.business()?.category || 'business'} connected to My Living Wiki for ${this.cityName()}. Visitors can ask questions by text or voice in their preferred language.`,
  );
  readonly filteredLanguages = computed(() => {
    const query = this.normalizeSearch(this.languageSearch());
    if (!query) {
      return BUSINESS_LANGUAGES;
    }
    return BUSINESS_LANGUAGES.filter((language) => this.normalizeSearch([
      language.country,
      language.language,
      language.code,
    ].join(' ')).includes(query));
  });
  readonly selectedGreeting = computed(() => this.selectedLanguage().greeting);

  constructor() {
    this.selectBrowserLanguage();
    effect(() => {
      const claimKey = this.claimKey();
      if (!claimKey) {
        return;
      }
      void this.loadBusiness(claimKey);
    });
    effect(() => {
      this.title.setTitle(`${this.businessName()} | Business | My Living Wiki`);
    });
  }

  onLanguageSearchInput(event: Event): void {
    this.languageSearch.set((event.target as HTMLInputElement).value);
    queueMicrotask(() => {
      this.languageTrack?.nativeElement.scrollTo({ left: 0, behavior: 'smooth' });
      this.syncLanguageScrollState();
    });
  }

  clearLanguageSearch(): void {
    this.languageSearch.set('');
    queueMicrotask(() => {
      this.languageTrack?.nativeElement.scrollTo({ left: 0, behavior: 'smooth' });
      this.syncLanguageScrollState();
    });
  }

  selectLanguage(language: BusinessLanguage): void {
    this.selectedLanguage.set(language);
    queueMicrotask(() => this.scrollSelectedLanguageIntoView());
  }

  isSelectedLanguage(language: BusinessLanguage): boolean {
    const selected = this.selectedLanguage();
    return selected.country === language.country && selected.language === language.language && selected.code === language.code;
  }

  scrollLanguages(direction: -1 | 1): void {
    const track = this.languageTrack?.nativeElement;
    if (!track) {
      return;
    }
    const card = track.querySelector<HTMLElement>('[data-business-language-card="true"]');
    const amount = card ? card.offsetWidth + 16 : Math.max(180, track.clientWidth * 0.7);
    track.scrollBy({ left: amount * direction, behavior: 'smooth' });
    window.setTimeout(() => this.syncLanguageScrollState(), 240);
  }

  syncLanguageScrollState(): void {
    const track = this.languageTrack?.nativeElement;
    if (!track) {
      this.languageAtStart.set(true);
      this.languageAtEnd.set(true);
      return;
    }
    const maxScrollLeft = Math.max(0, track.scrollWidth - track.clientWidth);
    this.languageAtStart.set(track.scrollLeft <= 2);
    this.languageAtEnd.set(track.scrollLeft >= maxScrollLeft - 2);
  }

  async copyDetailLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.detailUrl());
      this.copiedLink.set(true);
      window.setTimeout(() => this.copiedLink.set(false), 1600);
    } catch {
      this.loadError.set('Could not copy the business detail link.');
    }
  }

  async copyGuideLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.publicChatUrl());
      this.copiedGuideLink.set(true);
      window.setTimeout(() => this.copiedGuideLink.set(false), 1600);
    } catch {
      this.loadError.set('Could not copy the business guide link.');
    }
  }

  async shareBusinessGuide(): Promise<void> {
    const shareData = {
      title: `${this.businessName()} on My Living Wiki`,
      text: `Chat with ${this.businessName()} in your language.`,
      url: this.publicChatUrl(),
    };
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share(shareData);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
      }
    }
    await this.copyGuideLink();
  }

  async downloadBadgePng(): Promise<void> {
    if (typeof document === 'undefined') {
      return;
    }
    const image = await this.loadImage(this.badgeSvgHref());
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 900;
    const context = canvas.getContext('2d');
    if (!context) {
      this.loadError.set('Could not render the badge PNG.');
      return;
    }
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 900, 900);
    context.drawImage(image, 0, 0, 900, 900);
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = this.badgePngFilename();
    link.click();
  }

  scrollToSection(sectionId: string): void {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return;
    }
    const section = document.getElementById(sectionId);
    if (!section) {
      return;
    }
    const top = section.getBoundingClientRect().top + window.scrollY - 96;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }

  startVoiceMode(): void {
    void this.router.navigate([this.chatPath()], { queryParams: this.chatQueryParams() });
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Badge image could not be rendered for PNG download.'));
      image.src = src;
    });
  }

  private async loadBusiness(claimKey: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const business = await this.businessClaimService.findWorkspaceByClaimKey(claimKey);
      this.business.set(business);
      if (!business) {
        this.loadError.set('This business page has not been created yet.');
      }
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : 'Could not load this business page.');
    } finally {
      this.loading.set(false);
      window.setTimeout(() => this.syncLanguageScrollState(), 100);
    }
  }

  private scrollSelectedLanguageIntoView(): void {
    const track = this.languageTrack?.nativeElement;
    if (!track) {
      return;
    }
    const index = this.filteredLanguages().findIndex((language) => this.isSelectedLanguage(language));
    const cards = Array.from(track.querySelectorAll<HTMLElement>('[data-business-language-card="true"]'));
    cards[index]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    window.setTimeout(() => this.syncLanguageScrollState(), 240);
  }

  private selectBrowserLanguage(): void {
    if (typeof navigator === 'undefined') {
      return;
    }
    const locale = navigator.languages?.[0] || navigator.language || '';
    const normalized = locale.toLowerCase();
    const code = normalized.startsWith('pt-br') ? 'pt-br' : normalized.split('-')[0];
    const region = normalized.split('-')[1]?.toUpperCase() ?? '';
    const countryByRegion: Record<string, string> = {
      AU: 'Australia',
      BR: 'Brazil',
      CA: 'Canada',
      CD: 'DR Congo',
      CN: 'China',
      DE: 'Germany',
      ES: 'Spain',
      FR: 'France',
      GB: 'England',
      IN: 'India',
      MX: 'Mexico',
      PT: 'Portugal',
      RU: 'Russia',
      US: 'United States',
    };
    const preferredCountryByCode: Record<string, string> = {
      ar: 'Saudi Arabia',
      de: 'Germany',
      en: 'United States',
      es: 'Spain',
      fr: 'France',
      pt: 'Portugal',
      'pt-br': 'Brazil',
      ru: 'Russia',
      zh: 'China',
    };
    const preferredCountry = countryByRegion[region] ?? preferredCountryByCode[code];
    const language = preferredCountry
      ? BUSINESS_LANGUAGES.find((option) => option.country === preferredCountry && option.code === code)
      : BUSINESS_LANGUAGES.find((option) => option.code === code);
    if (language) {
      this.selectedLanguage.set(language);
    }
  }

  private defaultLanguage(): BusinessLanguage {
    return BUSINESS_LANGUAGES.find((language) => language.country === 'United States') ?? BUSINESS_LANGUAGES[0];
  }

  private origin(): string {
    return typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://mylivingwiki.com';
  }

  private normalizeSearch(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private titleizeSlug(value: string): string {
    return value
      .split('-')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ') || 'Business';
  }
}
