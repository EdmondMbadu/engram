import { DOCUMENT } from '@angular/common';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { httpsCallable } from 'firebase/functions';
import { AuthService } from '../auth.service';
import { getFirebaseFunctions } from '../firebase.client';

type MembershipCheckoutPlan = 'explorer' | 'lifetime';

@Component({
  selector: 'app-membership',
  imports: [RouterLink],
  templateUrl: './membership.html',
  styleUrl: './membership.css',
})
export class MembershipComponent implements OnInit, OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly meta = inject(Meta);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly isSignedIn = this.authService.isAuthenticated;
  readonly checkoutLoading = signal<MembershipCheckoutPlan | null>(null);
  readonly checkoutError = signal<string | null>(null);
  readonly checkoutStatus = signal<string | null>(null);

  readonly features = [
    {
      icon: 'auto_awesome',
      title: 'AI Wiki Wizard',
      copy: 'Build a rich, interactive board in under 5 minutes with our AI co-pilot.',
    },
    {
      icon: 'location_on',
      title: 'Maps & Off-Grid',
      copy: 'Tag places using what3words and find spots most people miss.',
    },
    {
      icon: 'music_video',
      title: 'Media & Music',
      copy: 'Embed YouTube clips, songs, photos & more to bring boards to life.',
    },
    {
      icon: 'map',
      title: 'Itineraries & Tours',
      copy: 'Create walking tours, road trips & day plans that are easy to share.',
    },
    {
      icon: 'share',
      title: 'Share Anywhere',
      copy: 'Export as beautiful cards or MP4 videos for social media in one click.',
    },
    {
      icon: 'groups',
      title: 'Connect & Collaborate',
      copy: 'Invite friends, plan events, and build boards together.',
    },
  ];

  readonly stats = [
    { icon: 'public', value: '200+', label: 'Global Cities' },
    { icon: 'school', value: '500+', label: 'Colleges & Universities' },
    { icon: 'dashboard', value: '10,000+', label: 'Wiki Boards Created' },
    { icon: 'collections', value: '150,000+', label: 'Cards Generated' },
    { icon: 'smart_display', value: '25,000+', label: 'Social Videos Shared' },
  ];

  readonly launchPerks = [
    'Early access to new tools',
    'Founding-member pricing',
    'Higher AI-generation limits',
    'Exclusive templates',
    'Reserve your public username',
    'Featured-member opportunities',
  ];

  ngOnInit(): void {
    const origin = this.document.location?.origin;
    const image = origin && origin !== 'null' ? `${origin}/og-membership.png` : '/og-membership.png';
    const description =
      'Turn cities, campuses, journeys, and curiosities into interactive worlds of places, stories, media, and unexpected discoveries.';

    this.meta.addTags([
      { name: 'description', content: description },
      { property: 'og:type', content: 'website' },
      { property: 'og:title', content: 'Don’t Just Search. Let’s Go. | LivingWiki' },
      { property: 'og:description', content: description },
      { property: 'og:image', content: image },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: 'Don’t Just Search. Let’s Go. | LivingWiki' },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: image },
    ]);

    void this.restoreMembershipCheckout();
  }

  async startMembershipCheckout(plan: MembershipCheckoutPlan): Promise<void> {
    if (this.checkoutLoading()) {
      return;
    }

    if (!this.isSignedIn()) {
      await this.router.navigate(['/create-account'], {
        queryParams: { redirectTo: `/membership?checkout=${plan}` },
      });
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    this.checkoutLoading.set(plan);
    this.checkoutError.set(null);
    this.checkoutStatus.set(null);

    const origin = window.location.origin;
    const successUrl = `${origin}/membership?membershipPayment=success&plan=${plan}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/membership?membershipPayment=cancelled&plan=${plan}`;

    try {
      const createCheckoutSession = httpsCallable(
        getFirebaseFunctions(),
        'createMembershipCheckoutSession',
      );
      const result = await createCheckoutSession({ plan, successUrl, cancelUrl });
      const data = result.data as { url?: string; sessionUrl?: string };
      const checkoutUrl = data.url || data.sessionUrl;
      if (!checkoutUrl) {
        throw new Error('Checkout URL was not returned.');
      }
      window.location.href = checkoutUrl;
    } catch {
      this.checkoutError.set('Checkout could not be started. Please try again in a moment.');
      this.checkoutLoading.set(null);
    }
  }

  private async restoreMembershipCheckout(): Promise<void> {
    const requestedPlan = this.normalizeCheckoutPlan(this.route.snapshot.queryParamMap.get('checkout'));
    const returnedPlan = this.normalizeCheckoutPlan(this.route.snapshot.queryParamMap.get('plan'));
    const payment = this.route.snapshot.queryParamMap.get('membershipPayment');
    const sessionId = this.route.snapshot.queryParamMap.get('session_id');

    if (payment === 'cancelled') {
      this.checkoutError.set('Checkout was cancelled. Your place is still here when you’re ready.');
      await this.clearCheckoutQueryParams();
      return;
    }

    if (payment === 'success') {
      if (!sessionId) {
        this.checkoutError.set('Payment returned without a checkout session. Please contact support.');
        return;
      }

      this.checkoutLoading.set(returnedPlan ?? 'explorer');
      this.checkoutStatus.set('Confirming your Launch Membership…');
      try {
        const confirmCheckout = httpsCallable(
          getFirebaseFunctions(),
          'confirmMembershipCheckoutSession',
        );
        const result = await confirmCheckout({ sessionId });
        const data = result.data as { paid?: boolean };
        if (!data.paid) {
          throw new Error('Checkout was not paid.');
        }
        await this.authService.refreshUser();
        this.checkoutStatus.set('Welcome, Launch Member! Your membership is active.');
      } catch {
        this.checkoutError.set(
          'We could not confirm the payment yet. If you were charged, refresh in a moment or contact support.',
        );
        this.checkoutStatus.set(null);
      } finally {
        this.checkoutLoading.set(null);
        await this.clearCheckoutQueryParams();
      }
      return;
    }

    if (requestedPlan && this.isSignedIn()) {
      await this.clearCheckoutQueryParams();
      await this.startMembershipCheckout(requestedPlan);
    }
  }

  private async clearCheckoutQueryParams(): Promise<void> {
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        checkout: null,
        membershipPayment: null,
        plan: null,
        session_id: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private normalizeCheckoutPlan(value: string | null): MembershipCheckoutPlan | null {
    return value === 'explorer' || value === 'lifetime' ? value : null;
  }

  ngOnDestroy(): void {
    for (const selector of [
      "name='description'",
      "property='og:type'",
      "property='og:title'",
      "property='og:description'",
      "property='og:image'",
      "name='twitter:card'",
      "name='twitter:title'",
      "name='twitter:description'",
      "name='twitter:image'",
    ]) {
      this.meta.removeTag(selector);
    }
  }
}
