import { Routes } from '@angular/router';
import { MarketingComponent } from './marketing/marketing';
import { LandingComponent } from './landing/landing';
import { SignInComponent } from './sign-in/sign-in';
import { CreateAccountComponent } from './create-account/create-account';
import { ForgotPasswordComponent } from './forgot-password/forgot-password';
import { VerifyEmailComponent } from './verify-email/verify-email';
import { AuthActionComponent } from './auth-action/auth-action';
import { WikiComponent } from './wiki/wiki';
import { ChatComponent } from './chat/chat';
import { LibraryComponent } from './library/library';
import { AtlasManageComponent } from './atlas-manage/atlas-manage';
import { AtlasLandingComponent } from './atlas-landing/atlas-landing';
import { AtlasHomeRedirectComponent } from './atlas-home-redirect/atlas-home-redirect';
import { LegalComponent } from './legal/legal';
import { PublicWikisComponent } from './public-wikis/public-wikis';
import { WebScraperComponent } from './web-scraper/web-scraper';
import { authGuard, guestOnlyGuard } from './auth.guards';

export const routes: Routes = [
  { path: '', component: MarketingComponent, title: 'Living Wiki' },
  { path: 'home', component: AtlasHomeRedirectComponent, title: 'Home | Living Wiki', canActivate: [authGuard] },
  { path: 'upload/:slug', component: LandingComponent, title: 'Upload | Living Wiki' },
  { path: 'upload', component: LandingComponent, title: 'Upload | Living Wiki', canActivate: [authGuard] },
  { path: 'chat/:slug', component: ChatComponent, title: 'Chat | Living Wiki' },
  { path: 'chat', component: ChatComponent, title: 'Chat | Living Wiki', canActivate: [authGuard] },
  { path: 'library/:slug', component: LibraryComponent, title: 'Library | Living Wiki' },
  { path: 'library', component: LibraryComponent, title: 'Library | Living Wiki', canActivate: [authGuard] },
  { path: 'scrapper', component: WebScraperComponent, title: 'Scrapper | Living Wiki', canActivate: [authGuard] },
  { path: 'wiki/:slug', component: WikiComponent, title: 'Public Wiki | Living Wiki' },
  { path: 'wiki', component: WikiComponent, title: 'Wiki | Living Wiki', canActivate: [authGuard] },
  { path: 'public-wikis', component: PublicWikisComponent, title: 'Public Wikis | Living Wiki' },
  { path: 'atlases', component: AtlasManageComponent, title: 'Atlas Settings | Living Wiki', canActivate: [authGuard] },
  { path: 'atlas/:slug', component: AtlasLandingComponent, title: 'Atlas | Living Wiki' },
  { path: 'privacy', component: LegalComponent, title: 'Privacy Policy | Living Wiki', data: { legalPage: 'privacy' } },
  { path: 'terms', component: LegalComponent, title: 'Terms and Conditions | Living Wiki', data: { legalPage: 'terms' } },
  { path: 'landing', redirectTo: 'home', pathMatch: 'full' },
  { path: 'sign-in', component: SignInComponent, title: 'Sign In | Living Wiki', canActivate: [guestOnlyGuard] },
  { path: 'create-account', component: CreateAccountComponent, title: 'Create Account | Living Wiki', canActivate: [guestOnlyGuard] },
  { path: 'forgot-password', component: ForgotPasswordComponent, title: 'Forgot Password | Living Wiki', canActivate: [guestOnlyGuard] },
  { path: 'verify-email', component: VerifyEmailComponent, title: 'Verify Email | Living Wiki' },
  { path: 'auth/action', component: AuthActionComponent, title: 'Account Action | Living Wiki' },
];
