import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';

type BillingCycle = 'monthly' | 'annual';

type BusinessFeature = {
  icon: string;
  title: string;
  description: string;
};

type BusinessPlan = {
  name: string;
  description: string;
  monthlyPrice: number;
  annualMonthlyPrice: number;
  featured?: boolean;
  cta: string;
  features: string[];
};

@Component({
  selector: 'app-business',
  imports: [RouterLink, ThemeToggleComponent],
  templateUrl: './business.html',
})
export class BusinessComponent {
  readonly billingCycle = signal<BillingCycle>('monthly');

  readonly citySignals = ['Philadelphia', 'Austin', 'London', 'Tokyo', 'Nairobi', 'Sao Paulo'];

  readonly features: BusinessFeature[] = [
    {
      icon: 'storefront',
      title: 'A living business profile',
      description:
        'Hours, menu, events, photos, your story - all in one page that updates in real time instead of going stale the day you post it.',
    },
    {
      icon: 'location_on',
      title: 'A pin on the city map',
      description:
        'Show up right in your own neighborhood on our interactive map - exactly where people are scanning for somewhere to go.',
    },
    {
      icon: 'explore',
      title: 'Featured by local guides',
      description:
        'Get picked for the curated lists locals trust - best secret coffee, the spot everyone should know - instead of fighting for page seven.',
    },
    {
      icon: 'verified',
      title: 'Verified Local Favorite badge',
      description:
        "A trust signal that tells visitors you're the real, community-vouched deal - not a drive-by chain.",
    },
    {
      icon: 'monitoring',
      title: 'Local search insights',
      description:
        'See what people near you are actually searching for, so you can stock, staff, and promote around real local demand.',
    },
    {
      icon: 'new_releases',
      title: 'Founding-business status',
      description:
        'Plant your flag early in a launch city. Founding businesses get a launch badge, lasting placement, and a hand in shaping their wiki.',
    },
  ];

  readonly plans: BusinessPlan[] = [
    {
      name: 'Local',
      description: 'Get on the map and start being found in your neighborhood.',
      monthlyPrice: 25,
      annualMonthlyPrice: 20,
      cta: 'Get started',
      features: [
        'Living business profile - hours, story, links, photos',
        'A pin on your neighborhood map',
        'Connected to nearby places and events',
        'Standard support',
      ],
    },
    {
      name: 'Local Favorite',
      description: 'Stand out, earn trust, and learn what your neighbors want.',
      monthlyPrice: 65,
      annualMonthlyPrice: 54,
      featured: true,
      cta: 'Claim your spot',
      features: [
        'Everything in Local',
        'Verified Local Favorite badge',
        'Featured in your neighborhood guide',
        'Monthly local-search insights',
        'Events and promotions on your profile',
        'Priority support',
      ],
    },
    {
      name: 'City Sponsor',
      description: 'Anchor your city. Maximum reach and full insight.',
      monthlyPrice: 180,
      annualMonthlyPrice: 150,
      cta: 'Start a conversation',
      features: [
        'Everything in Local Favorite',
        'Citywide featured placement',
        'Full discovery and analytics dashboard',
        'Sponsor a neighborhood guide or topic hub',
        'Founding-business status and launch badge',
        'Dedicated local partner manager',
      ],
    },
  ];

  readonly activePlans = computed(() =>
    this.plans.map((plan) => ({
      ...plan,
      price: this.billingCycle() === 'annual' ? plan.annualMonthlyPrice : plan.monthlyPrice,
      cadence:
        this.billingCycle() === 'annual' ? 'per month, billed annually' : 'per month',
    })),
  );

  setBillingCycle(cycle: BillingCycle): void {
    this.billingCycle.set(cycle);
  }
}
