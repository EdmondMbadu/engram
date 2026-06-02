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
        'Tell the story behind the place, keep hours and links current, and give people a richer page than a static directory listing.',
    },
    {
      icon: 'location_on',
      title: 'A pin on the city map',
      description:
        'Show up in the neighborhood context where visitors are already exploring food, culture, jobs, events, and local guides.',
    },
    {
      icon: 'explore',
      title: 'Featured guide placement',
      description:
        'Surface in curated local paths like hidden coffee, founder-friendly blocks, weekend plans, or places locals actually recommend.',
    },
    {
      icon: 'verified',
      title: 'Local Favorite trust badge',
      description:
        'Add a visible signal that this is a real, community-relevant business worth checking before the usual generic results.',
    },
    {
      icon: 'monitoring',
      title: 'Local search insights',
      description:
        'Learn what people are asking around your city so promotions, events, staffing, and inventory can follow actual demand.',
    },
    {
      icon: 'new_releases',
      title: 'Founding-business status',
      description:
        'Plant your flag early in a launch city with launch placement, a founding badge, and a stronger voice in how the wiki grows.',
    },
  ];

  readonly plans: BusinessPlan[] = [
    {
      name: 'Local',
      description: 'Get on the map and start being found around your neighborhood.',
      monthlyPrice: 25,
      annualMonthlyPrice: 20,
      cta: 'Get started',
      features: [
        'Living business profile with story, photos, hours, and links',
        'Neighborhood map placement',
        'Connections to nearby places, guides, and events',
        'Standard setup support',
      ],
    },
    {
      name: 'Local Favorite',
      description: 'Stand out, build trust, and understand what nearby people want.',
      monthlyPrice: 65,
      annualMonthlyPrice: 54,
      featured: true,
      cta: 'Claim your spot',
      features: [
        'Everything in Local',
        'Verified Local Favorite badge',
        'Featured placement in a neighborhood guide',
        'Monthly local-search insight summary',
        'Events and promotions on your profile',
        'Priority support',
      ],
    },
    {
      name: 'City Sponsor',
      description: 'Anchor a city wiki with maximum visibility and deeper insight.',
      monthlyPrice: 180,
      annualMonthlyPrice: 150,
      cta: 'Start a conversation',
      features: [
        'Everything in Local Favorite',
        'Citywide sponsor placement',
        'Discovery and analytics dashboard',
        'Sponsor a neighborhood guide or topic hub',
        'Founding-business launch badge',
        'Dedicated local partner support',
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
