import { Routes } from '@angular/router';
import { MarketingComponent } from './marketing/marketing';
import { LandingComponent } from './landing/landing';

export const routes: Routes = [
  { path: '', component: MarketingComponent },
  { path: 'landing', component: LandingComponent },
];

