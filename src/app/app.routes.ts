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
import { AtlasPersonaComponent } from './atlas-persona/atlas-persona';
import { AtlasLandingComponent } from './atlas-landing/atlas-landing';
import { LegalComponent } from './legal/legal';
import { PublicWikisComponent } from './public-wikis/public-wikis';
import { WebScraperComponent } from './web-scraper/web-scraper';
import { WikiHomeComponent } from './wiki-home/wiki-home';
import { SharedChatComponent } from './shared-chat/shared-chat';
import { AnswerCardComponent } from './answer-card/answer-card';
import { AnswerQuizComponent } from './answer-quiz/answer-quiz';
import { GreenJobsComponent } from './green-jobs/green-jobs';
import { CityPulseAdminComponent } from './city-pulse-admin/city-pulse-admin';
import { AdminUsersComponent } from './admin-users/admin-users';
import { CityPlacesComponent } from './city-places/city-places';
import { BusinessComponent } from './business/business';
import { NotFoundComponent } from './not-found/not-found';
import { adminGuard, authGuard, guestOnlyGuard } from './auth.guards';

export const routes: Routes = [
  { path: '', component: PublicWikisComponent, title: 'Public Wikis | LivingWiki' },
  {
    path: 'pricing',
    loadComponent: () => import('./pricing/pricing').then((m) => m.PricingComponent),
    title: 'Pricing | LivingWiki',
  },
  { path: 'landing', component: MarketingComponent, title: 'LivingWiki' },
  { path: 'marketing', redirectTo: 'landing', pathMatch: 'full' },
  { path: 'business', component: BusinessComponent, title: 'For Business | LivingWiki' },
  {
    path: 'business/claim',
    loadComponent: () => import('./business-claim/business-claim').then((m) => m.BusinessClaimComponent),
    title: 'Claim Your Business | LivingWiki',
  },
  {
    path: 'business/:citySlug/:businessSlug/edit',
    loadComponent: () => import('./business-detail/business-edit').then((m) => m.BusinessEditComponent),
    title: 'Edit Business | LivingWiki',
    canActivate: [authGuard],
  },
  {
    path: 'business/:citySlug/:businessSlug/voice',
    loadComponent: () => import('./business-detail/business-activity').then((m) => m.BusinessActivityComponent),
    title: 'Business Voice | LivingWiki',
    canActivate: [authGuard],
    data: { activity: 'voice' },
  },
  {
    path: 'business/:citySlug/:businessSlug/chat',
    loadComponent: () => import('./business-detail/business-activity').then((m) => m.BusinessActivityComponent),
    title: 'Business Chat History | LivingWiki',
    canActivate: [authGuard],
    data: { activity: 'chat' },
  },
  {
    path: 'business/:citySlug/:businessSlug',
    loadComponent: () => import('./business-detail/business-detail').then((m) => m.BusinessDetailComponent),
    title: 'Business Details | LivingWiki',
  },
  {
    // Lazy-loaded so the d3 projection libraries stay out of the initial bundle.
    path: 'dymaxion',
    loadComponent: () => import('./dymaxion/dymaxion').then((m) => m.DymaxionComponent),
    title: 'Dymaxion Map | LivingWiki',
  },
  {
    path: 'fence-line',
    loadComponent: () => import('./fence-line/fence-line').then((m) => m.FenceLineComponent),
    title: 'The Fenceline Network | LivingWiki',
  },
  { path: 'home', redirectTo: '', pathMatch: 'full' },
  {
    path: 'trove',
    loadComponent: () => import('./trove/trove').then((m) => m.TroveComponent),
    title: 'My Trove | LivingWiki',
  },
  { path: 'wikis', component: WikiHomeComponent, title: 'My Wikis | LivingWiki', canActivate: [authGuard] },
  {
    path: 'boards',
    loadComponent: () => import('./boards/boards').then((m) => m.BoardsComponent),
    title: 'Boards | LivingWiki',
  },
  {
    path: 'friends',
    loadComponent: () => import('./boards/boards').then((m) => m.BoardsComponent),
    title: 'Friends | LivingWiki',
    canActivate: [authGuard],
  },
  {
    path: 'boards/u/:ownerKey',
    loadComponent: () => import('./boards/boards').then((m) => m.BoardsComponent),
    title: 'User Boards | LivingWiki',
  },
  {
    path: 'boards/:boardId',
    loadComponent: () => import('./boards/boards').then((m) => m.BoardsComponent),
    title: 'Board | LivingWiki',
  },
  { path: 'upload/:slug', component: LandingComponent, title: 'Upload | LivingWiki' },
  { path: 'upload', component: LandingComponent, title: 'Upload | LivingWiki', canActivate: [authGuard] },
  { path: 'chat/shared/:threadId', component: SharedChatComponent, title: 'Shared Chat | LivingWiki' },
  { path: 'answer-card/:cardId', component: AnswerCardComponent, title: 'Answer Card | LivingWiki' },
  { path: 'quiz/:quizId', component: AnswerQuizComponent, title: 'Quiz Challenge | LivingWiki' },
  { path: 'places/:slug', component: CityPlacesComponent, title: 'Places | LivingWiki' },
  { path: 'chat/:slug', component: ChatComponent, title: 'Chat | LivingWiki' },
  { path: 'chat', component: ChatComponent, title: 'Chat | LivingWiki', canActivate: [authGuard] },
  { path: 'library/:slug', component: LibraryComponent, title: 'Source Files | LivingWiki' },
  { path: 'library', component: LibraryComponent, title: 'Source Files | LivingWiki', canActivate: [authGuard] },
  { path: 'scrapper', component: WebScraperComponent, title: 'Scrapper | LivingWiki', canActivate: [authGuard] },
  { path: 'wiki/:slug', component: WikiComponent, title: 'Public Wiki | LivingWiki' },
  { path: 'wiki', component: WikiComponent, title: 'Wiki | LivingWiki', canActivate: [authGuard] },
  { path: 'public-wikis', component: PublicWikisComponent, title: 'Public Wikis | LivingWiki' },
  {
    path: 'profile',
    loadComponent: () => import('./profile/profile').then((m) => m.ProfileComponent),
    title: 'Profile | LivingWiki',
    canActivate: [authGuard],
  },
  { path: 'atlases', component: AtlasManageComponent, title: 'Atlas Settings | LivingWiki', canActivate: [authGuard] },
  { path: 'admin/users', component: AdminUsersComponent, title: 'Users | LivingWiki', canActivate: [adminGuard] },
  { path: 'atlases/:atlasId/persona', component: AtlasPersonaComponent, title: 'Wiki Voice | LivingWiki', canActivate: [authGuard] },
  { path: 'atlas/:slug/green-jobs', component: GreenJobsComponent, title: 'Philly Green Jobs | LivingWiki' },
  { path: 'atlas/:slug/worldometers', component: CityPulseAdminComponent, title: 'Worldometers Maintenance | LivingWiki' },
  { path: 'atlas/:slug', component: AtlasLandingComponent, title: 'Atlas | LivingWiki' },
  { path: 'privacy', component: LegalComponent, title: 'Privacy Policy | LivingWiki', data: { legalPage: 'privacy' } },
  { path: 'terms', component: LegalComponent, title: 'Terms and Conditions | LivingWiki', data: { legalPage: 'terms' } },
  { path: 'sign-in', component: SignInComponent, title: 'Sign In | LivingWiki', canActivate: [guestOnlyGuard] },
  { path: 'create-account', component: CreateAccountComponent, title: 'Create Account | LivingWiki', canActivate: [guestOnlyGuard] },
  { path: 'forgot-password', component: ForgotPasswordComponent, title: 'Forgot Password | LivingWiki', canActivate: [guestOnlyGuard] },
  { path: 'verify-email', component: VerifyEmailComponent, title: 'Verify Email | LivingWiki' },
  { path: 'auth/action', component: AuthActionComponent, title: 'Account Action | LivingWiki' },
  { path: '**', component: NotFoundComponent, title: 'Page Not Found | LivingWiki' },
];
