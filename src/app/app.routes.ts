import { Routes } from '@angular/router';
import { PublicWikisComponent } from './public-wikis/public-wikis';
import { adminGuard, authGuard, boardsRootRedirectGuard, guestOnlyGuard } from './auth.guards';

const loadBoardsComponent = () => import('./boards/boards').then((m) => m.BoardsComponent);
const loadChatComponent = () => import('./chat/chat').then((m) => m.ChatComponent);
const loadLandingComponent = () => import('./landing/landing').then((m) => m.LandingComponent);
const loadLegalComponent = () => import('./legal/legal').then((m) => m.LegalComponent);
const loadLibraryComponent = () => import('./library/library').then((m) => m.LibraryComponent);
const loadWikiComponent = () => import('./wiki/wiki').then((m) => m.WikiComponent);

export const routes: Routes = [
  { path: '', component: PublicWikisComponent, title: $localize`Public Wikis | LivingWiki` },
  { path: 'all-cities', component: PublicWikisComponent, title: $localize`All Cities | LivingWiki`, data: { directoryPage: true } },
  {
    path: 'pricing',
    loadComponent: () => import('./pricing/pricing').then((m) => m.PricingComponent),
    title: $localize`Pricing | LivingWiki`,
  },
  {
    path: 'membership',
    loadComponent: () => import('./membership/membership').then((m) => m.MembershipComponent),
    title: 'Membership | LivingWiki',
  },
  {
    path: 'landing',
    loadComponent: () => import('./marketing/marketing').then((m) => m.MarketingComponent),
    title: $localize`LivingWiki`,
  },
  { path: 'marketing', redirectTo: 'landing', pathMatch: 'full' },
  {
    path: 'business',
    loadComponent: () => import('./business/business').then((m) => m.BusinessComponent),
    title: $localize`For Business | LivingWiki`,
  },
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
  {
    path: 'wikis',
    loadComponent: () => import('./wiki-home/wiki-home').then((m) => m.WikiHomeComponent),
    title: $localize`My Wikis | LivingWiki`,
    canActivate: [authGuard],
  },
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
    canActivate: [boardsRootRedirectGuard],
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
    path: 'collections/:slug',
    loadComponent: () => import('./city-board-collection/city-board-collection').then((m) => m.CityBoardCollectionComponent),
    title: 'Board Collection | LivingWiki',
    data: { userCollection: true, customCollection: true },
  },
  {
    path: 'manage/boards/:boardId/insights',
    loadComponent: () => import('./board-insights/board-insights').then((m) => m.BoardInsightsComponent),
    title: 'Board Insights | LivingWiki',
    canActivate: [authGuard],
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
  { path: 'upload/:slug', loadComponent: loadLandingComponent, title: $localize`Upload | LivingWiki` },
  { path: 'upload', loadComponent: loadLandingComponent, title: $localize`Upload | LivingWiki`, canActivate: [authGuard] },
  {
    path: 'chat/shared/:threadId',
    loadComponent: () => import('./shared-chat/shared-chat').then((m) => m.SharedChatComponent),
    title: $localize`Shared Chat | LivingWiki`,
  },
  {
    path: 'answer-card/:cardId',
    loadComponent: () => import('./answer-card/answer-card').then((m) => m.AnswerCardComponent),
    title: $localize`Answer Card | LivingWiki`,
  },
  {
    path: 'quiz/:quizId',
    loadComponent: () => import('./answer-quiz/answer-quiz').then((m) => m.AnswerQuizComponent),
    title: $localize`Quiz Challenge | LivingWiki`,
  },
  {
    path: 'places/:slug',
    loadComponent: () => import('./city-places/city-places').then((m) => m.CityPlacesComponent),
    title: $localize`Places | LivingWiki`,
  },
  {
    path: 'chat/:slug/boards',
    loadComponent: () => import('./city-board-collection/city-board-collection').then((m) => m.CityBoardCollectionComponent),
    title: 'Boards | LivingWiki',
  },
  { path: 'chat/:slug', loadComponent: loadChatComponent, title: $localize`Chat | LivingWiki` },
  { path: 'chat', loadComponent: loadChatComponent, title: $localize`Chat | LivingWiki`, canActivate: [authGuard] },
  { path: 'library/:slug', loadComponent: loadLibraryComponent, title: $localize`Source Files | LivingWiki` },
  { path: 'library', loadComponent: loadLibraryComponent, title: $localize`Source Files | LivingWiki`, canActivate: [authGuard] },
  {
    path: 'scrapper',
    loadComponent: () => import('./web-scraper/web-scraper').then((m) => m.WebScraperComponent),
    title: $localize`Scrapper | LivingWiki`,
    canActivate: [authGuard],
  },
  { path: 'wiki/:slug', loadComponent: loadWikiComponent, title: $localize`Public Wiki | LivingWiki` },
  { path: 'wiki', loadComponent: loadWikiComponent, title: $localize`Wiki | LivingWiki`, canActivate: [authGuard] },
  { path: 'public-wikis', component: PublicWikisComponent, title: $localize`Public Wikis | LivingWiki` },
  {
    path: 'profile',
    loadComponent: () => import('./profile/profile').then((m) => m.ProfileComponent),
    title: $localize`Profile | LivingWiki`,
    canActivate: [authGuard],
  },
  {
    path: 'atlases',
    loadComponent: () => import('./atlas-manage/atlas-manage').then((m) => m.AtlasManageComponent),
    title: $localize`Atlas Settings | LivingWiki`,
    canActivate: [authGuard],
  },
  {
    path: 'admin/users',
    loadComponent: () => import('./admin-users/admin-users').then((m) => m.AdminUsersComponent),
    title: $localize`Users | LivingWiki`,
    canActivate: [adminGuard],
  },
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
  {
    path: 'atlases/:atlasId/persona',
    loadComponent: () => import('./atlas-persona/atlas-persona').then((m) => m.AtlasPersonaComponent),
    title: $localize`Wiki Voice | LivingWiki`,
    canActivate: [authGuard],
  },
  {
    path: 'atlas/:slug/green-jobs',
    loadComponent: () => import('./green-jobs/green-jobs').then((m) => m.GreenJobsComponent),
    title: $localize`Philly Green Jobs | LivingWiki`,
  },
  {
    path: 'atlas/:slug/worldometers',
    loadComponent: () => import('./city-pulse-admin/city-pulse-admin').then((m) => m.CityPulseAdminComponent),
    title: $localize`Worldometers Maintenance | LivingWiki`,
  },
  {
    path: 'atlas/:slug',
    loadComponent: () => import('./atlas-landing/atlas-landing').then((m) => m.AtlasLandingComponent),
    title: $localize`Atlas | LivingWiki`,
  },
  { path: 'privacy', loadComponent: loadLegalComponent, title: $localize`Privacy Policy | LivingWiki`, data: { legalPage: 'privacy' } },
  { path: 'terms', loadComponent: loadLegalComponent, title: $localize`Terms and Conditions | LivingWiki`, data: { legalPage: 'terms' } },
  {
    path: 'sign-in',
    loadComponent: () => import('./sign-in/sign-in').then((m) => m.SignInComponent),
    title: $localize`Sign In | LivingWiki`,
    canActivate: [guestOnlyGuard],
  },
  {
    path: 'create-account',
    loadComponent: () => import('./create-account/create-account').then((m) => m.CreateAccountComponent),
    title: $localize`Create Account | LivingWiki`,
    canActivate: [guestOnlyGuard],
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('./forgot-password/forgot-password').then((m) => m.ForgotPasswordComponent),
    title: $localize`Forgot Password | LivingWiki`,
    canActivate: [guestOnlyGuard],
  },
  {
    path: 'verify-email',
    loadComponent: () => import('./verify-email/verify-email').then((m) => m.VerifyEmailComponent),
    title: $localize`Verify Email | LivingWiki`,
  },
  {
    path: 'auth/action',
    loadComponent: () => import('./auth-action/auth-action').then((m) => m.AuthActionComponent),
    title: $localize`Account Action | LivingWiki`,
  },
  {
    path: '**',
    loadComponent: () => import('./not-found/not-found').then((m) => m.NotFoundComponent),
    title: $localize`Page Not Found | LivingWiki`,
  },
];
