import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { httpsCallable } from 'firebase/functions';
import { AccountMenuComponent } from '../account-menu/account-menu';
import { AuthService } from '../auth.service';
import { getFirebaseFunctions } from '../firebase.client';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { WorkspaceSidebarComponent } from '../workspace-sidebar/workspace-sidebar';
import { MobileMenuComponent } from '../mobile-menu/mobile-menu';

type BillingCycle = 'monthly' | 'annual';
type PricingFeature = 'personal-voice' | 'private-boards' | 'video-narration' | null;
type PersonalPaidPlanId = 'personal_plus' | 'creator';
type PricingPlanId =
  | 'reader'
  | PersonalPaidPlanId
  | 'teams';

type PricingPlan = {
  id: PricingPlanId;
  name: string;
  eyebrow?: string;
  description: string;
  monthlyPrice: number;
  annualMonthlyPrice: number;
  featured?: boolean;
  contact?: boolean;
  icon: string;
  cta: string;
  route: string;
  features: string[];
};

@Component({
  selector: 'app-pricing',
  imports: [RouterLink, ThemeToggleComponent, WorkspaceSidebarComponent, AccountMenuComponent, MobileMenuComponent],
  templateUrl: './pricing.html',
  styleUrl: './pricing.css',
})
export class PricingComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly isSignedIn = this.authService.isAuthenticated;
  readonly billingCycle = signal<BillingCycle>('monthly');
  readonly requestedFeature = signal<PricingFeature>(null);
  readonly checkoutLoading = signal<string | null>(null);
  readonly checkoutError = signal<string | null>(null);
  readonly checkoutStatus = signal<string | null>(null);

  readonly plans: PricingPlan[] = [
    {
      id: 'reader',
      name: 'Reader',
      description: $localize`Follow public LivingWiki pages and keep a lightweight local knowledge home.`,
      monthlyPrice: 0,
      annualMonthlyPrice: 0,
      icon: 'explore',
      cta: 'Create free account',
      route: '/create-account',
      features: [
        'Follow public city and topic wikis',
        'Save favorite pages and source links',
        'Create narrated Stack videos with included voices',
        'Start one personal LivingWiki draft',
      ],
    },
    {
      id: 'personal_plus',
      name: 'Personal Plus',
      description: $localize`Build private source-aware wikis for trips, research, family projects, or local obsessions.`,
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
        'Create a reusable Personal Voice narrator',
      ],
    },
    {
      id: 'creator',
      name: 'Professional',
      eyebrow: 'Professional plan',
      description: $localize`Publish polished LivingWiki pages for your work, community, classes, collections, or public projects.`,
      monthlyPrice: 29,
      annualMonthlyPrice: 24,
      icon: 'campaign',
      cta: 'Go professional',
      route: '/landing',
      features: [
        'Public topic page publishing',
        'Custom landing page summary and media',
        'Source library and update workflow',
        'Basic visitor and question insights',
        'Create a reusable Personal Voice narrator',
        'Talking Avatars available as an add-on',
      ],
    },
    {
      id: 'teams',
      name: 'Teams & organizations',
      eyebrow: 'More seats',
      description: $localize`Bring LivingWiki to a team, classroom, newsroom, nonprofit, or organization with a plan shaped around your needs.`,
      monthlyPrice: 0,
      annualMonthlyPrice: 0,
      contact: true,
      icon: 'groups',
      cta: 'Contact us',
      route: 'mailto:jim.walker@mindpalace.com?subject=LivingWiki%20team%20plan',
      features: [
        'Flexible pricing for additional seats',
        'Shared publishing and collaboration workflows',
        'Guided onboarding for your team',
        'Priority support and rollout planning',
      ],
    },
  ];

  readonly pricingDescription = $localize`Start free, then choose the plan that fits how you research, publish, and collaborate.`;

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
    this.requestedFeature() === 'personal-voice'
      ? $localize`Unlock your personal narrator voice`
      : this.requestedFeature() === 'video-narration'
        ? $localize`Standard video narration is included free`
        : this.requestedFeature() === 'private-boards'
          ? $localize`Upgrade to create private LivingWikis`
          : this.isSignedIn()
            ? $localize`Upgrade your LivingWiki account`
            : $localize`Upgrade when you are ready for more than browsing`,
  );

  readonly promptDescription = computed(() =>
    this.requestedFeature() === 'personal-voice'
      ? $localize`Creating a reusable narrator from your own recording is available with Personal Plus or Professional. All included narrator voices and narrated video exports remain free.`
      : this.requestedFeature() === 'video-narration'
        ? $localize`Return to Stack Studio to create a narrated video with any included voice. A paid plan is only required when you create and use your own Personal Voice.`
        : this.requestedFeature() === 'private-boards'
          ? $localize`Choose Personal Plus or Professional to keep LivingWiki spaces private. Public boards and narrated Stack video exports remain free.`
          : this.isSignedIn()
            ? $localize`Your free account is active. Upgrade only when you need private spaces, Personal Voice, richer publishing, or team collaboration.`
            : $localize`Browse public LivingWikis and create narrated Stack videos for free, then upgrade when you need private spaces, Personal Voice, publishing, uploads, or team collaboration.`,
  );

  readonly promptEyebrow = computed(() =>
    this.requestedFeature() === 'video-narration'
      ? $localize`Included with Free`
      : this.requestedFeature() === 'personal-voice' || this.requestedFeature() === 'private-boards'
        ? $localize`Paid feature`
        : $localize`Free`,
  );

  readonly activePlans = computed(() => {
    const annual = this.billingCycle() === 'annual';
    return this.plans
      .map((plan) => ({
        ...plan,
        price: annual ? plan.annualMonthlyPrice : plan.monthlyPrice,
        cadence: plan.contact
          ? 'Flexible plans for growing teams'
          : plan.monthlyPrice === 0
            ? 'free to start'
            : annual
              ? 'per month, billed annually'
              : 'per month',
        showStrike: !plan.contact && annual && plan.annualMonthlyPrice < plan.monthlyPrice,
      }));
  });

  ngOnInit(): void {
    void this.restoreCheckoutReturn();
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
      this.checkoutError.set($localize`Checkout could not be started. Check the Stripe price configuration and try again.`);
      this.checkoutLoading.set(null);
    }
  }

  private async restoreCheckoutReturn(): Promise<void> {
    const feature = this.route.snapshot.queryParamMap.get('feature');
    const billing = this.route.snapshot.queryParamMap.get('billing');
    const plan = this.route.snapshot.queryParamMap.get('plan');
    const payment = this.route.snapshot.queryParamMap.get('pricingPayment');
    const sessionId = this.route.snapshot.queryParamMap.get('session_id');

    if (feature === 'personal-voice' || feature === 'private-boards' || feature === 'video-narration') {
      this.requestedFeature.set(feature);
    }

    if (billing === 'monthly' || billing === 'annual') {
      this.billingCycle.set(billing);
    }

    if (payment === 'cancelled') {
      this.checkoutError.set($localize`Checkout was cancelled. You can pick a plan whenever you are ready.`);
      return;
    }

    if (payment !== 'success') {
      return;
    }

    if (!sessionId) {
      this.checkoutError.set($localize`Payment returned without a checkout session. Please try checkout again.`);
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
      this.checkoutError.set($localize`We could not confirm the payment yet. If your card was charged, refresh in a moment or contact support.`);
      this.checkoutStatus.set(null);
    } finally {
      this.checkoutLoading.set(null);
    }
  }
}
