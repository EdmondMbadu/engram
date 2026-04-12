import { Routes } from '@angular/router';
import { MarketingComponent } from './marketing/marketing';
import { LandingComponent } from './landing/landing';
import { SignInComponent } from './sign-in/sign-in';
import { CreateAccountComponent } from './create-account/create-account';
import { ForgotPasswordComponent } from './forgot-password/forgot-password';
import { WikiComponent } from './wiki/wiki';
import { ChatComponent } from './chat/chat';
import { LibraryComponent } from './library/library';

export const routes: Routes = [
  { path: '', component: MarketingComponent },
  { path: 'home', component: LandingComponent },
  { path: 'chat', component: ChatComponent },
  { path: 'library', component: LibraryComponent },
  { path: 'wiki', component: WikiComponent },
  { path: 'landing', redirectTo: 'home', pathMatch: 'full' },
  { path: 'sign-in', component: SignInComponent },
  { path: 'create-account', component: CreateAccountComponent },
  { path: 'forgot-password', component: ForgotPasswordComponent },
];
