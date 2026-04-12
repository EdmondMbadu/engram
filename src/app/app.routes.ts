import { Routes } from '@angular/router';
import { MarketingComponent } from './marketing/marketing';
import { LandingComponent } from './landing/landing';
import { SignInComponent } from './sign-in/sign-in';
import { CreateAccountComponent } from './create-account/create-account';
import { ForgotPasswordComponent } from './forgot-password/forgot-password';
import { WikiComponent } from './wiki/wiki';
import { ChatComponent } from './chat/chat';
import { LibraryComponent } from './library/library';
import { authGuard, guestOnlyGuard } from './auth.guards';

export const routes: Routes = [
  { path: '', component: MarketingComponent, title: 'Living Atlas' },
  { path: 'home', component: LandingComponent, title: 'Knowledge Base | Living Atlas', canActivate: [authGuard] },
  { path: 'chat', component: ChatComponent, title: 'Chat | Living Atlas', canActivate: [authGuard] },
  { path: 'library', component: LibraryComponent, title: 'Library | Living Atlas', canActivate: [authGuard] },
  { path: 'wiki', component: WikiComponent, title: 'Wiki | Living Atlas', canActivate: [authGuard] },
  { path: 'landing', redirectTo: 'home', pathMatch: 'full' },
  { path: 'sign-in', component: SignInComponent, title: 'Sign In | Living Atlas', canActivate: [guestOnlyGuard] },
  { path: 'create-account', component: CreateAccountComponent, title: 'Create Account | Living Atlas', canActivate: [guestOnlyGuard] },
  { path: 'forgot-password', component: ForgotPasswordComponent, title: 'Forgot Password | Living Atlas', canActivate: [guestOnlyGuard] },
];
