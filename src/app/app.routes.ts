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
  { path: '', component: PublicWikisComponent, title: 'Public Wikis | My living wiki' },
  { path: 'landing', component: MarketingComponent, title: 'My living wiki' },
  { path: 'marketing', redirectTo: 'landing', pathMatch: 'full' },
  { path: 'business', component: BusinessComponent, title: 'For Business | My living wiki' },
  {
    path: 'business/claim',
    loadComponent: () => import('./business-claim/business-claim').then((m) => m.BusinessClaimComponent),
    title: 'Claim Your Business | My living wiki',
  },
  {
    path: 'business/:citySlug/:businessSlug/edit',
    loadComponent: () => import('./business-detail/business-edit').then((m) => m.BusinessEditComponent),
    title: 'Edit Business | My living wiki',
    canActivate: [authGuard],
  },
  {
    path: 'business/:citySlug/:businessSlug',
    loadComponent: () => import('./business-detail/business-detail').then((m) => m.BusinessDetailComponent),
    title: 'Business Details | My living wiki',
  },
  {
    // Lazy-loaded so the d3 projection libraries stay out of the initial bundle.
    path: 'dymaxion',
    loadComponent: () => import('./dymaxion/dymaxion').then((m) => m.DymaxionComponent),
    title: 'Dymaxion Map | My living wiki',
  },
  { path: 'home', component: WikiHomeComponent, title: 'My Wikis | My living wiki', canActivate: [authGuard] },
  { path: 'wikis', component: WikiHomeComponent, title: 'My Wikis | My living wiki', canActivate: [authGuard] },
  { path: 'upload/:slug', component: LandingComponent, title: 'Upload | My living wiki' },
  { path: 'upload', component: LandingComponent, title: 'Upload | My living wiki', canActivate: [authGuard] },
  { path: 'chat/shared/:threadId', component: SharedChatComponent, title: 'Shared Chat | My living wiki' },
  { path: 'answer-card/:cardId', component: AnswerCardComponent, title: 'Answer Card | My living wiki' },
  { path: 'quiz/:quizId', component: AnswerQuizComponent, title: 'Quiz Challenge | My living wiki' },
  { path: 'places/:slug', component: CityPlacesComponent, title: 'Places | My living wiki' },
  { path: 'chat/:slug', component: ChatComponent, title: 'Chat | My living wiki' },
  { path: 'chat', component: ChatComponent, title: 'Chat | My living wiki', canActivate: [authGuard] },
  { path: 'library/:slug', component: LibraryComponent, title: 'Source Files | My living wiki' },
  { path: 'library', component: LibraryComponent, title: 'Source Files | My living wiki', canActivate: [authGuard] },
  { path: 'scrapper', component: WebScraperComponent, title: 'Scrapper | My living wiki', canActivate: [authGuard] },
  { path: 'wiki/:slug', component: WikiComponent, title: 'Public Wiki | My living wiki' },
  { path: 'wiki', component: WikiComponent, title: 'Wiki | My living wiki', canActivate: [authGuard] },
  { path: 'public-wikis', component: PublicWikisComponent, title: 'Public Wikis | My living wiki' },
  { path: 'atlases', component: AtlasManageComponent, title: 'Atlas Settings | My living wiki', canActivate: [authGuard] },
  { path: 'admin/users', component: AdminUsersComponent, title: 'Users | My living wiki', canActivate: [adminGuard] },
  { path: 'atlases/:atlasId/persona', component: AtlasPersonaComponent, title: 'Wiki Voice | My living wiki', canActivate: [authGuard] },
  { path: 'atlas/:slug/green-jobs', component: GreenJobsComponent, title: 'Philly Green Jobs | My living wiki' },
  { path: 'atlas/:slug/worldometers', component: CityPulseAdminComponent, title: 'Worldometers Maintenance | My living wiki' },
  { path: 'atlas/:slug', component: AtlasLandingComponent, title: 'Atlas | My living wiki' },
  { path: 'privacy', component: LegalComponent, title: 'Privacy Policy | My living wiki', data: { legalPage: 'privacy' } },
  { path: 'terms', component: LegalComponent, title: 'Terms and Conditions | My living wiki', data: { legalPage: 'terms' } },
  { path: 'sign-in', component: SignInComponent, title: 'Sign In | My living wiki', canActivate: [guestOnlyGuard] },
  { path: 'create-account', component: CreateAccountComponent, title: 'Create Account | My living wiki', canActivate: [guestOnlyGuard] },
  { path: 'forgot-password', component: ForgotPasswordComponent, title: 'Forgot Password | My living wiki', canActivate: [guestOnlyGuard] },
  { path: 'verify-email', component: VerifyEmailComponent, title: 'Verify Email | My living wiki' },
  { path: 'auth/action', component: AuthActionComponent, title: 'Account Action | My living wiki' },
  { path: '**', component: NotFoundComponent, title: 'Page Not Found | My living wiki' },
];
