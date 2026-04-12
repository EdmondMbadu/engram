import { isPlatformBrowser } from '@angular/common';
import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { FirebaseError } from 'firebase/app';
import {
  applyActionCode,
  browserLocalPersistence,
  browserSessionPersistence,
  checkActionCode,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  verifyPasswordResetCode,
  type ActionCodeSettings,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  doc,
  getFirestore,
  serverTimestamp,
  setDoc,
  type Firestore,
} from 'firebase/firestore/lite';
import { getFirebaseApp } from './firebase.client';

export interface SignInPayload {
  email: string;
  password: string;
  remember: boolean;
}

export interface CreateAccountPayload extends SignInPayload {
  fullName: string;
  redirectTo?: string | null;
}

export interface AuthResult {
  needsEmailVerification: boolean;
}

export interface CreateAccountResult extends AuthResult {
  verificationEmailSent: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<User | null>(null);
  readonly initialized = signal(false);
  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly uid = computed(() => this.user()?.uid ?? '');
  readonly emailVerified = computed(() => this.user()?.emailVerified ?? false);
  readonly needsEmailVerification = computed(() => {
    const user = this.user();
    return user ? this.userNeedsEmailVerification(user) : false;
  });
  readonly displayName = computed(() => {
    const user = this.user();
    if (!user) {
      return 'Living Atlas';
    }

    const name = user.displayName?.trim();
    if (name) {
      return name;
    }

    const email = user.email?.trim();
    if (email) {
      return email.split('@')[0] ?? email;
    }

    return 'Living Atlas User';
  });
  readonly email = computed(() => this.user()?.email ?? '');

  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly auth: Auth | null = this.isBrowser ? getAuth(getFirebaseApp()) : null;
  private readonly firestore: Firestore | null = this.isBrowser
    ? getFirestore(getFirebaseApp())
    : null;
  private readonly googleProvider = new GoogleAuthProvider();
  private resolveReady: (() => void) | null = null;
  private readonly readyPromise = new Promise<void>((resolve) => {
    this.resolveReady = resolve;
  });

  constructor() {
    if (!this.auth) {
      this.markReady();
      return;
    }

    this.googleProvider.addScope('email');
    this.googleProvider.addScope('profile');
    this.googleProvider.setCustomParameters({ prompt: 'select_account' });
    this.auth.useDeviceLanguage();

    onAuthStateChanged(this.auth, (user) => {
      this.user.set(user);

      if (user) {
        void this.syncUserProfile(user).catch(() => undefined);
      }

      this.markReady();
    });
  }

  waitForReady(): Promise<void> {
    return this.readyPromise;
  }

  async signInWithEmail(payload: SignInPayload): Promise<AuthResult> {
    const auth = this.requireAuth();
    await setPersistence(
      auth,
      payload.remember ? browserLocalPersistence : browserSessionPersistence,
    );

    const credential = await signInWithEmailAndPassword(
      auth,
      this.normalizeEmail(payload.email),
      payload.password,
    );

    try {
      await this.syncUserProfile(credential.user);
    } catch (error) {
      await signOut(auth);
      throw error;
    }

    await this.refreshUser();

    return {
      needsEmailVerification: this.userNeedsEmailVerification(credential.user),
    };
  }

  async signInWithGoogle(remember: boolean): Promise<AuthResult> {
    const auth = this.requireAuth();
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);

    const credential = await signInWithPopup(auth, this.googleProvider);

    try {
      await this.syncUserProfile(credential.user);
    } catch (error) {
      await signOut(auth);
      throw error;
    }

    await this.refreshUser();

    return {
      needsEmailVerification: this.userNeedsEmailVerification(credential.user),
    };
  }

  async createAccount(payload: CreateAccountPayload): Promise<CreateAccountResult> {
    const auth = this.requireAuth();
    await setPersistence(
      auth,
      payload.remember ? browserLocalPersistence : browserSessionPersistence,
    );

    const credential = await createUserWithEmailAndPassword(
      auth,
      this.normalizeEmail(payload.email),
      payload.password,
    );

    try {
      const fullName = payload.fullName.trim();
      if (fullName) {
        await updateProfile(credential.user, { displayName: fullName });
      }

      await this.refreshUser();
      await this.syncUserProfile(auth.currentUser ?? credential.user);
    } catch (error) {
      try {
        await deleteUser(credential.user);
      } catch {
        await signOut(auth);
      }

      throw error;
    }

    const verificationEmailSent = await this.sendVerificationEmail(
      credential.user,
      payload.redirectTo,
    );

    await this.refreshUser();

    return {
      needsEmailVerification: this.userNeedsEmailVerification(credential.user),
      verificationEmailSent,
    };
  }

  async sendPasswordReset(email: string): Promise<void> {
    const auth = this.requireAuth();
    await sendPasswordResetEmail(auth, this.normalizeEmail(email), this.getActionCodeSettings('resetPasswordComplete'));
  }

  async resendEmailVerification(redirectTo?: string | null): Promise<boolean> {
    const user = this.requireCurrentUser();
    return this.sendVerificationEmail(user, redirectTo);
  }

  async refreshUser(): Promise<User | null> {
    const auth = this.requireAuth();
    if (!auth.currentUser) {
      this.user.set(null);
      return null;
    }

    await reload(auth.currentUser);
    this.user.set(auth.currentUser);

    if (auth.currentUser) {
      await this.syncUserProfile(auth.currentUser);
    }

    return auth.currentUser;
  }

  async applyEmailVerificationCode(code: string): Promise<void> {
    const auth = this.requireAuth();
    await applyActionCode(auth, code);
    await this.refreshUser().catch(() => null);
  }

  async validatePasswordResetCode(code: string): Promise<string> {
    const auth = this.requireAuth();
    return verifyPasswordResetCode(auth, code);
  }

  async completePasswordReset(code: string, password: string): Promise<void> {
    const auth = this.requireAuth();
    await confirmPasswordReset(auth, code, password);
  }

  async restoreEmailFromCode(code: string): Promise<string | null> {
    const auth = this.requireAuth();
    const info = await checkActionCode(auth, code);
    const restoredEmail = info.data.email ?? null;
    await applyActionCode(auth, code);
    return restoredEmail;
  }

  async signOut(): Promise<void> {
    const auth = this.requireAuth();
    await signOut(auth);
  }

  toFriendlyError(error: unknown): string {
    if (!(error instanceof FirebaseError)) {
      return 'Something went wrong. Please try again.';
    }

    switch (error.code) {
      case 'auth/email-already-in-use':
        return 'An account already exists for that email address.';
      case 'auth/invalid-email':
        return 'Enter a valid email address.';
      case 'auth/invalid-credential':
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        return 'Incorrect email or password.';
      case 'auth/weak-password':
        return 'Use at least 8 characters for your password.';
      case 'auth/popup-closed-by-user':
        return 'Google sign-in was closed before it finished.';
      case 'auth/popup-blocked':
        return 'Your browser blocked the Google sign-in popup. Allow popups and try again.';
      case 'auth/cancelled-popup-request':
        return 'Another sign-in window is already open.';
      case 'auth/network-request-failed':
        return 'Network error. Check your connection and try again.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Wait a moment and try again.';
      case 'auth/user-disabled':
        return 'This account has been disabled.';
      case 'auth/operation-not-allowed':
        return 'This sign-in method is not enabled in Firebase Auth yet.';
      case 'auth/unauthorized-domain':
        return 'This domain is not authorized for Firebase sign-in yet.';
      case 'auth/invalid-action-code':
        return 'This email link is invalid or has already been used.';
      case 'auth/expired-action-code':
        return 'This email link has expired. Request a new one and try again.';
      case 'auth/requires-recent-login':
        return 'Please sign in again before making that change.';
      case 'permission-denied':
        return 'Authentication succeeded, but we could not save your profile. Check Firestore rules for users/{uid}.';
      case 'unavailable':
        return 'The profile service is temporarily unavailable. Please try again.';
      default:
        return 'Authentication failed. Please try again.';
    }
  }

  private requireAuth(): Auth {
    if (!this.auth) {
      throw new Error('Authentication is only available in the browser.');
    }

    return this.auth;
  }

  private requireFirestore(): Firestore {
    if (!this.firestore) {
      throw new Error('Firestore is only available in the browser.');
    }

    return this.firestore;
  }

  private requireCurrentUser(): User {
    const user = this.requireAuth().currentUser;
    if (!user) {
      throw new Error('You must be signed in.');
    }

    return user;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private async syncUserProfile(user: User): Promise<void> {
    const firestore = this.requireFirestore();
    const normalizedEmail = user.email ? this.normalizeEmail(user.email) : null;
    const profile = {
      id: user.uid,
      authUid: user.uid,
      email: normalizedEmail,
      emailVerified: user.emailVerified,
      displayName: user.displayName?.trim() || null,
      photoURL: user.photoURL ?? null,
      providers: user.providerData
        .map((provider) => provider.providerId)
        .filter((providerId): providerId is string => Boolean(providerId)),
      creationTime: user.metadata.creationTime ?? null,
      lastSignInTime: user.metadata.lastSignInTime ?? null,
      updatedAt: serverTimestamp(),
    };

    await setDoc(doc(firestore, 'users', user.uid), profile, { merge: true });
  }

  private async sendVerificationEmail(
    user: User,
    redirectTo?: string | null,
  ): Promise<boolean> {
    if (!this.userNeedsEmailVerification(user)) {
      return false;
    }

    try {
      await sendEmailVerification(user, this.getActionCodeSettings('verifyEmailComplete', redirectTo));
      return true;
    } catch {
      return false;
    }
  }

  private getActionCodeSettings(
    flow: 'verifyEmailComplete' | 'resetPasswordComplete',
    redirectTo?: string | null,
  ): ActionCodeSettings | undefined {
    if (!this.isBrowser) {
      return undefined;
    }

    const url = new URL('/auth/action', window.location.origin);
    url.searchParams.set('flow', flow);

    if (this.isSafeRedirect(redirectTo)) {
      url.searchParams.set('redirectTo', redirectTo);
    }

    return {
      url: url.toString(),
      handleCodeInApp: false,
    };
  }

  private userNeedsEmailVerification(user: User): boolean {
    const providers = user.providerData
      .map((provider) => provider.providerId)
      .filter((providerId): providerId is string => Boolean(providerId));

    return providers.includes('password') && !user.emailVerified;
  }

  private isSafeRedirect(value: string | null | undefined): value is string {
    return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');
  }

  private markReady(): void {
    if (this.initialized()) {
      return;
    }

    this.initialized.set(true);
    this.resolveReady?.();
    this.resolveReady = null;
  }
}
