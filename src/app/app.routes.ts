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
import { authGuard, guestOnlyGuard } from './auth.guards';

export const routes: Routes = [
  { path: '', component: MarketingComponent, title: 'Living Atlas' },
  { path: 'home', component: LandingComponent, title: 'Upload | Living Atlas', canActivate: [authGuard] },
  { path: 'chat', component: ChatComponent, title: 'Chat | Living Atlas', canActivate: [authGuard] },
  { path: 'library', component: LibraryComponent, title: 'Library | Living Atlas', canActivate: [authGuard] },
  { path: 'wiki', component: WikiComponent, title: 'Wiki | Living Atlas', canActivate: [authGuard] },
  { path: 'atlases', component: AtlasManageComponent, title: 'Atlas Settings | Living Atlas', canActivate: [authGuard] },
  { path: 'atlas/:slug', component: AtlasLandingComponent, title: 'Atlas | Living Atlas' },
  { path: 'landing', redirectTo: 'home', pathMatch: 'full' },
  { path: 'sign-in', component: SignInComponent, title: 'Sign In | Living Atlas', canActivate: [guestOnlyGuard] },
  { path: 'create-account', component: CreateAccountComponent, title: 'Create Account | Living Atlas', canActivate: [guestOnlyGuard] },
  { path: 'forgot-password', component: ForgotPasswordComponent, title: 'Forgot Password | Living Atlas', canActivate: [guestOnlyGuard] },
  { path: 'verify-email', component: VerifyEmailComponent, title: 'Verify Email | Living Atlas' },
  { path: 'auth/action', component: AuthActionComponent, title: 'Account Action | Living Atlas' },
];
