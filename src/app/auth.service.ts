import { isPlatformBrowser } from '@angular/common';
import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { FirebaseError } from 'firebase/app';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type Auth,
  type User,
} from 'firebase/auth';
import { getFirebaseApp } from './firebase.client';

export interface SignInPayload {
  email: string;
  password: string;
  remember: boolean;
}

export interface CreateAccountPayload extends SignInPayload {
  fullName: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<User | null>(null);
  readonly initialized = signal(false);
  readonly isAuthenticated = computed(() => this.user() !== null);
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
      this.markReady();
    });
  }

  waitForReady(): Promise<void> {
    return this.readyPromise;
  }

  async signInWithEmail(payload: SignInPayload): Promise<void> {
    const auth = this.requireAuth();
    await setPersistence(
      auth,
      payload.remember ? browserLocalPersistence : browserSessionPersistence,
    );
    await signInWithEmailAndPassword(auth, this.normalizeEmail(payload.email), payload.password);
  }

  async signInWithGoogle(remember: boolean): Promise<void> {
    const auth = this.requireAuth();
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
    await signInWithPopup(auth, this.googleProvider);
  }

  async createAccount(payload: CreateAccountPayload): Promise<void> {
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

    const fullName = payload.fullName.trim();
    if (fullName) {
      await updateProfile(credential.user, { displayName: fullName });
      this.user.set(auth.currentUser);
    }

    try {
      await sendEmailVerification(credential.user);
    } catch {
      // Verification email should never block onboarding.
    }
  }

  async sendPasswordReset(email: string): Promise<void> {
    const auth = this.requireAuth();
    await sendPasswordResetEmail(auth, this.normalizeEmail(email));
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

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
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
