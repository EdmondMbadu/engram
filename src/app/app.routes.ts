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
  { path: '', component: PublicWikisComponent, title: 'Public Wikis | Living Wiki' },
  { path: 'landing', component: MarketingComponent, title: 'Living Wiki' },
  { path: 'marketing', redirectTo: 'landing', pathMatch: 'full' },
  { path: 'business', component: BusinessComponent, title: 'For Business | Living Wiki' },
  {
    path: 'business/claim',
    loadComponent: () => import('./business-claim/business-claim').then((m) => m.BusinessClaimComponent),
    title: 'Claim Your Business | Living Wiki',
  },
  {
    path: 'business/:citySlug/:businessSlug/edit',
    loadComponent: () => import('./business-detail/business-edit').then((m) => m.BusinessEditComponent),
    title: 'Edit Business | Living Wiki',
    canActivate: [authGuard],
  },
  {
    path: 'business/:citySlug/:businessSlug/voice',
    loadComponent: () => import('./business-detail/business-activity').then((m) => m.BusinessActivityComponent),
    title: 'Business Voice | Living Wiki',
    canActivate: [authGuard],
    data: { activity: 'voice' },
  },
  {
    path: 'business/:citySlug/:businessSlug/chat',
    loadComponent: () => import('./business-detail/business-activity').then((m) => m.BusinessActivityComponent),
    title: 'Business Chat History | Living Wiki',
    canActivate: [authGuard],
    data: { activity: 'chat' },
  },
  {
    path: 'business/:citySlug/:businessSlug',
    loadComponent: () => import('./business-detail/business-detail').then((m) => m.BusinessDetailComponent),
    title: 'Business Details | Living Wiki',
  },
  {
    // Lazy-loaded so the d3 projection libraries stay out of the initial bundle.
    path: 'dymaxion',
    loadComponent: () => import('./dymaxion/dymaxion').then((m) => m.DymaxionComponent),
    title: 'Dymaxion Map | Living Wiki',
  },
  { path: 'home', redirectTo: '', pathMatch: 'full' },
  { path: 'wikis', component: WikiHomeComponent, title: 'My Wikis | Living Wiki', canActivate: [authGuard] },
  { path: 'upload/:slug', component: LandingComponent, title: 'Upload | Living Wiki' },
  { path: 'upload', component: LandingComponent, title: 'Upload | Living Wiki', canActivate: [authGuard] },
  { path: 'chat/shared/:threadId', component: SharedChatComponent, title: 'Shared Chat | Living Wiki' },
  { path: 'answer-card/:cardId', component: AnswerCardComponent, title: 'Answer Card | Living Wiki' },
  { path: 'quiz/:quizId', component: AnswerQuizComponent, title: 'Quiz Challenge | Living Wiki' },
  { path: 'places/:slug', component: CityPlacesComponent, title: 'Places | Living Wiki' },
  { path: 'chat/:slug', component: ChatComponent, title: 'Chat | Living Wiki' },
  { path: 'chat', component: ChatComponent, title: 'Chat | Living Wiki', canActivate: [authGuard] },
  { path: 'library/:slug', component: LibraryComponent, title: 'Source Files | Living Wiki' },
  { path: 'library', component: LibraryComponent, title: 'Source Files | Living Wiki', canActivate: [authGuard] },
  { path: 'scrapper', component: WebScraperComponent, title: 'Scrapper | Living Wiki', canActivate: [authGuard] },
  { path: 'wiki/:slug', component: WikiComponent, title: 'Public Wiki | Living Wiki' },
  { path: 'wiki', component: WikiComponent, title: 'Wiki | Living Wiki', canActivate: [authGuard] },
  { path: 'public-wikis', component: PublicWikisComponent, title: 'Public Wikis | Living Wiki' },
  {
    path: 'profile',
    loadComponent: () => import('./profile/profile').then((m) => m.ProfileComponent),
    title: 'Profile | Living Wiki',
    canActivate: [authGuard],
  },
  { path: 'atlases', component: AtlasManageComponent, title: 'Atlas Settings | Living Wiki', canActivate: [authGuard] },
  { path: 'admin/users', component: AdminUsersComponent, title: 'Users | Living Wiki', canActivate: [adminGuard] },
  { path: 'atlases/:atlasId/persona', component: AtlasPersonaComponent, title: 'Wiki Voice | Living Wiki', canActivate: [authGuard] },
  { path: 'atlas/:slug/green-jobs', component: GreenJobsComponent, title: 'Philly Green Jobs | Living Wiki' },
  { path: 'atlas/:slug/worldometers', component: CityPulseAdminComponent, title: 'Worldometers Maintenance | Living Wiki' },
  { path: 'atlas/:slug', component: AtlasLandingComponent, title: 'Atlas | Living Wiki' },
  { path: 'privacy', component: LegalComponent, title: 'Privacy Policy | Living Wiki', data: { legalPage: 'privacy' } },
  { path: 'terms', component: LegalComponent, title: 'Terms and Conditions | Living Wiki', data: { legalPage: 'terms' } },
  { path: 'sign-in', component: SignInComponent, title: 'Sign In | Living Wiki', canActivate: [guestOnlyGuard] },
  { path: 'create-account', component: CreateAccountComponent, title: 'Create Account | Living Wiki', canActivate: [guestOnlyGuard] },
  { path: 'forgot-password', component: ForgotPasswordComponent, title: 'Forgot Password | Living Wiki', canActivate: [guestOnlyGuard] },
  { path: 'verify-email', component: VerifyEmailComponent, title: 'Verify Email | Living Wiki' },
  { path: 'auth/action', component: AuthActionComponent, title: 'Account Action | Living Wiki' },
  { path: '**', component: NotFoundComponent, title: 'Page Not Found | Living Wiki' },
];
