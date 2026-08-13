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

const loadBoardsComponent = () => import('./boards/boards').then((m) => m.BoardsComponent);

export const routes: Routes = [
  { path: '', component: PublicWikisComponent, title: $localize`Public Wikis | LivingWiki` },
  { path: 'all-cities', component: PublicWikisComponent, title: $localize`All Cities | LivingWiki`, data: { directoryPage: true } },
  {
    path: 'pricing',
    loadComponent: () => import('./pricing/pricing').then((m) => m.PricingComponent),
    title: $localize`Pricing | LivingWiki`,
  },
  { path: 'landing', component: MarketingComponent, title: $localize`LivingWiki` },
  { path: 'marketing', redirectTo: 'landing', pathMatch: 'full' },
  { path: 'business', component: BusinessComponent, title: $localize`For Business | LivingWiki` },
  {
    path: 'business/claim',
    loadComponent: () => import('./business-claim/business-claim').then((m) => m.BusinessClaimComponent),
    title: $localize`Claim Your Business | LivingWiki`,
  },
  {
    path: 'business/:citySlug/:businessSlug/edit',
    loadComponent: () => import('./business-detail/business-edit').then((m) => m.BusinessEditComponent),
    title: $localize`Edit Business | LivingWiki`,
    canActivate: [authGuard],
  },
  {
    path: 'business/:citySlug/:businessSlug/voice',
    loadComponent: () => import('./business-detail/business-activity').then((m) => m.BusinessActivityComponent),
    title: $localize`Business Voice | LivingWiki`,
    canActivate: [authGuard],
    data: { activity: 'voice' },
  },
  {
    path: 'business/:citySlug/:businessSlug/chat',
    loadComponent: () => import('./business-detail/business-activity').then((m) => m.BusinessActivityComponent),
    title: $localize`Business Chat History | LivingWiki`,
    canActivate: [authGuard],
    data: { activity: 'chat' },
  },
  {
    path: 'business/:citySlug/:businessSlug',
    loadComponent: () => import('./business-detail/business-detail').then((m) => m.BusinessDetailComponent),
    title: $localize`Business Details | LivingWiki`,
  },
  {
    // Lazy-loaded so the d3 projection libraries stay out of the initial bundle.
    path: 'dymaxion',
    loadComponent: () => import('./dymaxion/dymaxion').then((m) => m.DymaxionComponent),
    title: $localize`Dymaxion Map | LivingWiki`,
  },
  {
    path: 'fence-line',
    loadComponent: () => import('./fence-line/fence-line').then((m) => m.FenceLineComponent),
    title: $localize`The Fenceline Network | LivingWiki`,
  },
  { path: 'home', component: PublicWikisComponent, title: $localize`Home | LivingWiki`, canActivate: [authGuard], data: { signedInHome: true } },
  { path: 'discover', component: PublicWikisComponent, canActivate: [authGuard], data: { discoverPage: true } },
  {
    path: 'trove',
    loadComponent: () => import('./trove/trove').then((m) => m.TroveComponent),
    title: $localize`My Trove | LivingWiki`,
  },
  { path: 'wikis', component: WikiHomeComponent, title: $localize`My Wikis | LivingWiki`, canActivate: [authGuard] },
  {
    path: 'videos',
    loadComponent: () => import('./video-library/video-library').then((m) => m.VideoLibraryComponent),
    title: $localize`My Videos | LivingWiki`,
    canActivate: [authGuard],
  },
  {
    path: 'boards',
    loadComponent: loadBoardsComponent,
    title: $localize`Boards | LivingWiki`,
  },
  {
    path: 'songs',
    loadComponent: loadBoardsComponent,
    title: $localize`Songs | LivingWiki`,
    data: { songsPage: true },
  },
  {
    path: 'trips',
    loadComponent: loadBoardsComponent,
  },
  {
    path: 'friends',
    loadComponent: loadBoardsComponent,
    title: $localize`Friends | LivingWiki`,
    canActivate: [authGuard],
  },
  {
    path: 'boards/u/:ownerKey',
    loadComponent: loadBoardsComponent,
    title: $localize`User Boards | LivingWiki`,
  },
  {
    path: 'boards/u/:ownerKey/collections/:slug',
    loadComponent: () => import('./city-board-collection/city-board-collection').then((m) => m.CityBoardCollectionComponent),
    title: 'Board Collection | LivingWiki',
    data: { userCollection: true },
  },
  {
    path: 'boards/:boardId',
    loadComponent: loadBoardsComponent,
    title: $localize`Board | LivingWiki`,
  },
  {
    path: 'songs/:boardId',
    loadComponent: loadBoardsComponent,
    title: $localize`Song Board | LivingWiki`,
    data: { songsPage: true },
  },
  {
    path: 'trips/:boardId',
    loadComponent: loadBoardsComponent,
  },
  { path: 'upload/:slug', component: LandingComponent, title: $localize`Upload | LivingWiki` },
  { path: 'upload', component: LandingComponent, title: $localize`Upload | LivingWiki`, canActivate: [authGuard] },
  { path: 'chat/shared/:threadId', component: SharedChatComponent, title: $localize`Shared Chat | LivingWiki` },
  { path: 'answer-card/:cardId', component: AnswerCardComponent, title: $localize`Answer Card | LivingWiki` },
  { path: 'quiz/:quizId', component: AnswerQuizComponent, title: $localize`Quiz Challenge | LivingWiki` },
  { path: 'places/:slug', component: CityPlacesComponent, title: $localize`Places | LivingWiki` },
  {
    path: 'chat/:slug/boards',
    loadComponent: () => import('./city-board-collection/city-board-collection').then((m) => m.CityBoardCollectionComponent),
    title: 'Boards | LivingWiki',
  },
  { path: 'chat/:slug', component: ChatComponent, title: $localize`Chat | LivingWiki` },
  { path: 'chat', component: ChatComponent, title: $localize`Chat | LivingWiki`, canActivate: [authGuard] },
  { path: 'library/:slug', component: LibraryComponent, title: $localize`Source Files | LivingWiki` },
  { path: 'library', component: LibraryComponent, title: $localize`Source Files | LivingWiki`, canActivate: [authGuard] },
  { path: 'scrapper', component: WebScraperComponent, title: $localize`Scrapper | LivingWiki`, canActivate: [authGuard] },
  { path: 'wiki/:slug', component: WikiComponent, title: $localize`Public Wiki | LivingWiki` },
  { path: 'wiki', component: WikiComponent, title: $localize`Wiki | LivingWiki`, canActivate: [authGuard] },
  { path: 'public-wikis', component: PublicWikisComponent, title: $localize`Public Wikis | LivingWiki` },
  {
    path: 'profile',
    loadComponent: () => import('./profile/profile').then((m) => m.ProfileComponent),
    title: $localize`Profile | LivingWiki`,
    canActivate: [authGuard],
  },
  { path: 'atlases', component: AtlasManageComponent, title: $localize`Atlas Settings | LivingWiki`, canActivate: [authGuard] },
  { path: 'admin/users', component: AdminUsersComponent, title: $localize`Users | LivingWiki`, canActivate: [adminGuard] },
  {
    path: 'admin/city-board-factory',
    loadComponent: () => import('./bulk-board-admin/bulk-board-admin').then((m) => m.BulkBoardAdminComponent),
    title: 'City Board Factory | LivingWiki',
    canActivate: [adminGuard],
    data: { factoryKind: 'city' },
  },
  {
    path: 'admin/university-board-factory',
    loadComponent: () => import('./bulk-board-admin/bulk-board-admin').then((m) => m.BulkBoardAdminComponent),
    title: 'University Board Factory | LivingWiki',
    canActivate: [adminGuard],
    data: { factoryKind: 'university' },
  },
  { path: 'atlases/:atlasId/persona', component: AtlasPersonaComponent, title: $localize`Wiki Voice | LivingWiki`, canActivate: [authGuard] },
  { path: 'atlas/:slug/green-jobs', component: GreenJobsComponent, title: $localize`Philly Green Jobs | LivingWiki` },
  { path: 'atlas/:slug/worldometers', component: CityPulseAdminComponent, title: $localize`Worldometers Maintenance | LivingWiki` },
  { path: 'atlas/:slug', component: AtlasLandingComponent, title: $localize`Atlas | LivingWiki` },
  { path: 'privacy', component: LegalComponent, title: $localize`Privacy Policy | LivingWiki`, data: { legalPage: 'privacy' } },
  { path: 'terms', component: LegalComponent, title: $localize`Terms and Conditions | LivingWiki`, data: { legalPage: 'terms' } },
  { path: 'sign-in', component: SignInComponent, title: $localize`Sign In | LivingWiki`, canActivate: [guestOnlyGuard] },
  { path: 'create-account', component: CreateAccountComponent, title: $localize`Create Account | LivingWiki`, canActivate: [guestOnlyGuard] },
  { path: 'forgot-password', component: ForgotPasswordComponent, title: $localize`Forgot Password | LivingWiki`, canActivate: [guestOnlyGuard] },
  { path: 'verify-email', component: VerifyEmailComponent, title: $localize`Verify Email | LivingWiki` },
  { path: 'auth/action', component: AuthActionComponent, title: $localize`Account Action | LivingWiki` },
  { path: '**', component: NotFoundComponent, title: $localize`Page Not Found | LivingWiki` },
];
