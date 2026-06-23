import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { httpsCallable } from 'firebase/functions';
import { AccountMenuComponent } from '../account-menu/account-menu';
import { AuthService } from '../auth.service';
import { getFirebaseFunctions } from '../firebase.client';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { WorkspaceSidebarComponent } from '../workspace-sidebar/workspace-sidebar';

type PricingAudience = 'general' | 'business';
type BillingCycle = 'monthly' | 'annual';
type PersonalPaidPlanId = 'personal_plus' | 'creator';
type PricingPlanId =
  | 'reader'
  | PersonalPaidPlanId
  | 'business_local'
  | 'business_favorite'
  | 'business_sponsor';

type PricingPlan = {
  id: PricingPlanId;
  audience: PricingAudience;
  name: string;
  description: string;
  monthlyPrice: number;
  annualMonthlyPrice: number;
  featured?: boolean;
  icon: string;
  cta: string;
  route: string;
  features: string[];
};

@Component({
  selector: 'app-pricing',
  imports: [RouterLink, ThemeToggleComponent, WorkspaceSidebarComponent, AccountMenuComponent],
  templateUrl: './pricing.html',
  styleUrl: './pricing.css',
})
export class PricingComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly isSignedIn = this.authService.isAuthenticated;
  readonly activeAudience = signal<PricingAudience>('general');
  readonly billingCycle = signal<BillingCycle>('monthly');
  readonly checkoutLoading = signal<string | null>(null);
  readonly checkoutError = signal<string | null>(null);
  readonly checkoutStatus = signal<string | null>(null);

  readonly plans: PricingPlan[] = [
    {
      id: 'reader',
      audience: 'general',
      name: 'Reader',
      description: 'Follow public LivingWiki pages and keep a lightweight local knowledge home.',
      monthlyPrice: 0,
      annualMonthlyPrice: 0,
      icon: 'explore',
      cta: 'Create free account',
      route: '/create-account',
      features: [
        'Follow public city and topic wikis',
        'Save favorite pages and source links',
        'Join weekly update lists',
        'Start one personal LivingWiki draft',
      ],
    },
    {
      id: 'personal_plus',
      audience: 'general',
      name: 'Personal Plus',
      description: 'Build private source-aware wikis for trips, research, family projects, or local obsessions.',
      monthlyPrice: 12,
      annualMonthlyPrice: 10,
      featured: true,
      icon: 'auto_awesome',
      cta: 'Upgrade personal',
      route: '/create-account',
      features: [
        'Up to 5 private LivingWiki spaces',
        'Document uploads and cited answers',
        'Personal library across cities and topics',
        'Priority access to new AI tools',
      ],
    },
    {
      id: 'creator',
      audience: 'general',
      name: 'Creator',
      description: 'Publish richer LivingWiki pages for communities, collections, classes, or public projects.',
      monthlyPrice: 29,
      annualMonthlyPrice: 24,
      icon: 'campaign',
      cta: 'Start publishing',
      route: '/landing',
      features: [
        'Public topic page publishing',
        'Custom landing page summary and media',
        'Source library and update workflow',
        'Basic visitor and question insights',
      ],
    },
    {
      id: 'business_local',
      audience: 'business',
      name: 'Local',
      description: 'Get on the city map and give people a better first answer than a static listing.',
      monthlyPrice: 25,
      annualMonthlyPrice: 20,
      icon: 'location_on',
      cta: 'Claim a business',
      route: '/business/claim',
      features: [
        'Living business profile with story, photos, hours, and links',
        'Neighborhood map placement',
        'Connections to nearby guides and events',
        'Standard setup support',
      ],
    },
    {
      id: 'business_favorite',
      audience: 'business',
      name: 'Local Favorite',
      description: 'Stand out with trust signals, featured context, and a clearer business voice.',
      monthlyPrice: 65,
      annualMonthlyPrice: 54,
      featured: true,
      icon: 'verified',
      cta: 'Upgrade business',
      route: '/business/claim',
      features: [
        'Everything in Local',
        'Verified Local Favorite badge',
        'Featured placement in a neighborhood guide',
        'Events and promotions on your profile',
        'Monthly local-search insight summary',
      ],
    },
    {
      id: 'business_sponsor',
      audience: 'business',
      name: 'City Sponsor',
      description: 'Anchor a city wiki with citywide placement and deeper local discovery signals.',
      monthlyPrice: 180,
      annualMonthlyPrice: 150,
      icon: 'apartment',
      cta: 'Talk to us',
      route: '/business',
      features: [
        'Everything in Local Favorite',
        'Citywide sponsor placement',
        'Discovery and analytics dashboard',
        'Sponsor a neighborhood guide or topic hub',
        'Dedicated local partner support',
      ],
    },
  ];

  readonly hasPaidPricingPlan = computed(() => {
    const profile = this.authService.profile();
    const plan = (profile?.pricingPlan || profile?.businessPlan || '').trim().toLowerCase();
    const status = (profile?.subscriptionStatus || '').trim().toLowerCase();
    const hasSubscriptionId = Boolean(profile?.stripeSubscriptionId?.trim());
    const hasPaidPlanName = Boolean(plan) && !['free', 'none', 'reader', 'trial'].includes(plan);
    const activeStatus = !status || ['active', 'trialing', 'paid'].includes(status);
    return (hasPaidPlanName || hasSubscriptionId) && activeStatus;
  });

  readonly showUpgradePrompt = computed(() => !this.hasPaidPricingPlan());

  readonly promptTitle = computed(() =>
    this.isSignedIn()
      ? 'Upgrade your LivingWiki account'
      : 'Upgrade when you are ready for more than browsing',
  );

  readonly promptDescription = computed(() =>
    this.isSignedIn()
      ? 'You are not on a paid pricing plan yet. Pick a personal or business tier to unlock private spaces, richer publishing, or local business tools.'
      : 'Browse the public directory for free, then choose a personal or business tier when you want to save work, publish, upload sources, or claim a local business.',
  );

  readonly activeCopy = computed(() =>
    this.activeAudience() === 'business'
      ? {
          eyebrow: 'Business upgrades',
          title: 'Turn local discovery into an owned channel.',
          description: 'Simple launch tiers for businesses that want a better profile, guide placement, badges, and insight into what people ask around the city.',
        }
      : {
          eyebrow: 'Personal upgrades',
          title: 'Build a LivingWiki for the things you care about.',
          description: 'Start free, then upgrade when you need private spaces, document uploads, publishing, and stronger tools for personal research or community projects.',
        },
  );

  readonly activePlans = computed(() => {
    const annual = this.billingCycle() === 'annual';
    return this.plans
      .filter((plan) => plan.audience === this.activeAudience())
      .map((plan) => ({
        ...plan,
        price: annual ? plan.annualMonthlyPrice : plan.monthlyPrice,
        cadence: plan.monthlyPrice === 0 ? 'free to start' : annual ? 'per month, billed annually' : 'per month',
        showStrike: annual && plan.annualMonthlyPrice < plan.monthlyPrice,
      }));
  });

  ngOnInit(): void {
    void this.restoreCheckoutReturn();
  }

  setAudience(audience: PricingAudience): void {
    this.checkoutError.set(null);
    this.activeAudience.set(audience);
  }

  setBillingCycle(cycle: BillingCycle): void {
    this.checkoutError.set(null);
    this.billingCycle.set(cycle);
  }

  isPersonalPaidPlan(plan: PricingPlan): plan is PricingPlan & { id: PersonalPaidPlanId } {
    return plan.id === 'personal_plus' || plan.id === 'creator';
  }

  checkoutKey(plan: PricingPlan): string {
    return `${plan.id}:${this.billingCycle()}`;
  }

  async startPersonalCheckout(plan: PricingPlan): Promise<void> {
    if (!this.isPersonalPaidPlan(plan) || this.checkoutLoading()) {
      return;
    }

    if (!this.isSignedIn()) {
      await this.router.navigate(['/create-account'], {
        queryParams: {
          redirectTo: `/pricing?audience=general&plan=${plan.id}&billing=${this.billingCycle()}`,
        },
      });
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    const billingCycle = this.billingCycle();
    const checkoutKey = this.checkoutKey(plan);
    this.checkoutLoading.set(checkoutKey);
    this.checkoutError.set(null);
    this.checkoutStatus.set(null);

    const origin = window.location.origin;
    const successUrl = `${origin}/pricing?pricingPayment=success&audience=general&plan=${encodeURIComponent(plan.id)}&billing=${encodeURIComponent(billingCycle)}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/pricing?pricingPayment=cancelled&audience=general&plan=${encodeURIComponent(plan.id)}&billing=${encodeURIComponent(billingCycle)}`;

    try {
      const createCheckoutSession = httpsCallable(getFirebaseFunctions(), 'createUserCheckoutSession');
      const result = await createCheckoutSession({
        plan: plan.id,
        billingCycle,
        successUrl,
        cancelUrl,
      });
      const data = result.data as { url?: string; sessionUrl?: string };
      const checkoutUrl = data.url || data.sessionUrl;
      if (!checkoutUrl) {
        throw new Error('Checkout URL was not returned.');
      }
      window.location.href = checkoutUrl;
    } catch {
      this.checkoutError.set('Checkout could not be started. Check the Stripe price configuration and try again.');
      this.checkoutLoading.set(null);
    }
  }

  private async restoreCheckoutReturn(): Promise<void> {
    const audience = this.route.snapshot.queryParamMap.get('audience');
    const billing = this.route.snapshot.queryParamMap.get('billing');
    const plan = this.route.snapshot.queryParamMap.get('plan');
    const payment = this.route.snapshot.queryParamMap.get('pricingPayment');
    const sessionId = this.route.snapshot.queryParamMap.get('session_id');

    if (audience === 'general' || audience === 'business') {
      this.activeAudience.set(audience);
    }
    if (billing === 'monthly' || billing === 'annual') {
      this.billingCycle.set(billing);
    }

    if (payment === 'cancelled') {
      this.checkoutError.set('Checkout was cancelled. You can pick a plan whenever you are ready.');
      return;
    }

    if (payment !== 'success') {
      return;
    }

    if (!sessionId) {
      this.checkoutError.set('Payment returned without a checkout session. Please try checkout again.');
      return;
    }

    this.checkoutLoading.set(`${plan || 'personal'}:${billing || this.billingCycle()}`);
    this.checkoutError.set(null);
    this.checkoutStatus.set('Confirming your subscription...');

    try {
      const confirmCheckout = httpsCallable(getFirebaseFunctions(), 'confirmUserCheckoutSession');
      const result = await confirmCheckout({ sessionId });
      const data = result.data as { paid?: boolean; plan?: unknown; billingCycle?: unknown };
      if (!data.paid) {
        throw new Error('Checkout was not paid.');
      }
      if (data.billingCycle === 'monthly' || data.billingCycle === 'annual') {
        this.billingCycle.set(data.billingCycle);
      }
      await this.authService.refreshUser();
      this.checkoutStatus.set('Subscription confirmed. Your paid plan is active.');
    } catch {
      this.checkoutError.set('We could not confirm the payment yet. If your card was charged, refresh in a moment or contact support.');
      this.checkoutStatus.set(null);
    } finally {
      this.checkoutLoading.set(null);
    }
  }
}
