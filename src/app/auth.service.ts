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
import { httpsCallable, type Functions } from 'firebase/functions';
import {
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
  type Firestore,
} from 'firebase/firestore/lite';
import { getDownloadURL, ref as storageRef, uploadBytes, type FirebaseStorage } from 'firebase/storage';
import { getPublicAppUrl } from './firebase.config';
import { getFirebaseApp, getFirebaseFunctions, getFirebaseStorage } from './firebase.client';

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

export type AuthUserRole = 'admin' | 'user';

export interface AuthUserProfile {
  id: string;
  authUid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  photoURL: string | null;
  profileIcon: string | null;
  profilePictureType: 'icon' | 'image' | null;
  providers: string[];
  role: AuthUserRole;
  pricingPlan: string | null;
  businessPlan: string | null;
  subscriptionStatus: string | null;
  stripeSubscriptionId: string | null;
  creationTime: string | null;
  lastSignInTime: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<User | null>(null);
  readonly profile = signal<AuthUserProfile | null>(null);
  readonly initialized = signal(false);
  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly isAdmin = computed(() => this.profile()?.role === 'admin');
  readonly canCreateWikis = computed(() => this.isAdmin() || this.hasActivePersonalWikiPlan());
  readonly uid = computed(() => this.user()?.uid ?? '');
  readonly emailVerified = computed(() => this.user()?.emailVerified ?? false);
  readonly needsEmailVerification = computed(() => {
    const user = this.user();
    return user ? this.userNeedsEmailVerification(user) : false;
  });
  readonly displayName = computed(() => {
    const user = this.user();
    if (!user) {
      return 'LivingWiki';
    }

    const name = user.displayName?.trim();
    if (name) {
      return name;
    }

    const email = user.email?.trim();
    if (email) {
      return email.split('@')[0] ?? email;
    }

    return 'LivingWiki User';
  });
  readonly email = computed(() => this.user()?.email ?? '');

  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly auth: Auth | null = this.isBrowser ? getAuth(getFirebaseApp()) : null;
  private readonly firestore: Firestore | null = this.isBrowser
    ? getFirestore(getFirebaseApp())
    : null;
  private readonly storage: FirebaseStorage | null = this.isBrowser
    ? getFirebaseStorage()
    : null;
  private readonly functions: Functions | null = this.isBrowser ? getFirebaseFunctions() : null;
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
        void this.syncUserProfile(user)
          .catch(() => undefined)
          .finally(() => this.markReady());
      } else {
        this.profile.set(null);
        this.markReady();
      }
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

    await signInWithEmailAndPassword(
      auth,
      this.normalizeEmail(payload.email),
      payload.password,
    );

    let refreshedUser: User | null = null;
    try {
      refreshedUser = await this.refreshUser();
    } catch (error) {
      await signOut(auth);
      throw error;
    }

    return {
      needsEmailVerification: refreshedUser ? this.userNeedsEmailVerification(refreshedUser) : false,
    };
  }

  async signInWithGoogle(remember: boolean): Promise<AuthResult> {
    const auth = this.requireAuth();
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);

    await signInWithPopup(auth, this.googleProvider);

    let refreshedUser: User | null = null;
    try {
      refreshedUser = await this.refreshUser();
    } catch (error) {
      await signOut(auth);
      throw error;
    }

    return {
      needsEmailVerification: refreshedUser ? this.userNeedsEmailVerification(refreshedUser) : false,
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
    } catch (error) {
      try {
        await deleteUser(credential.user);
      } catch {
        await signOut(auth);
      }

      throw error;
    }

    let verificationEmailSent = false;
    try {
      verificationEmailSent = await this.sendVerificationEmail(
        auth.currentUser ?? credential.user,
        payload.redirectTo,
      );
    } catch {
      verificationEmailSent = false;
    }

    const refreshedUser = await this.refreshUser();

    return {
      needsEmailVerification: refreshedUser ? this.userNeedsEmailVerification(refreshedUser) : true,
      verificationEmailSent,
    };
  }

  async sendPasswordReset(email: string): Promise<void> {
    const auth = this.requireAuth();
    await sendPasswordResetEmail(auth, this.normalizeEmail(email), this.getActionCodeSettings('resetPasswordComplete'));
  }

  async resendEmailVerification(redirectTo?: string | null): Promise<boolean> {
    await this.refreshUser();
    return this.sendVerificationEmail(this.requireCurrentUser(), redirectTo);
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

  async getIdToken(): Promise<string> {
    const user = this.requireCurrentUser();
    return user.getIdToken();
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

  hasActivePersonalWikiPlan(): boolean {
    const profile = this.profile();
    const plan = (profile?.pricingPlan ?? '').trim().toLowerCase();
    const status = (profile?.subscriptionStatus ?? '').trim().toLowerCase();
    return ['personal_plus', 'creator'].includes(plan)
      && ['active', 'trialing', 'paid'].includes(status);
  }

  async chooseProfileIcon(iconCode: string): Promise<void> {
    const user = this.requireCurrentUser();
    const firestore = this.requireFirestore();
    const code = iconCode.trim();
    if (!code) {
      throw new Error('Choose a profile icon.');
    }

    await updateProfile(user, { photoURL: null });
    await setDoc(doc(firestore, 'users', user.uid), {
      profileIcon: code,
      photoURL: null,
      profilePictureType: 'icon',
      updatedAt: serverTimestamp(),
    }, { merge: true });
    await this.refreshUser();
  }

  async uploadProfilePhoto(file: File): Promise<void> {
    const user = this.requireCurrentUser();
    const firestore = this.requireFirestore();
    const storage = this.requireStorage();
    if (!file.type.startsWith('image/')) {
      throw new Error('Only image files are supported.');
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('Image must be under 10 MB.');
    }

    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const ref = storageRef(storage, `users/${user.uid}/profile/photo-${Date.now()}.${ext}`);
    await uploadBytes(ref, file, { contentType: file.type });
    const url = await getDownloadURL(ref);

    await updateProfile(user, { photoURL: url });
    await setDoc(doc(firestore, 'users', user.uid), {
      photoURL: url,
      profileIcon: null,
      profilePictureType: 'image',
      updatedAt: serverTimestamp(),
    }, { merge: true });
    await this.refreshUser();
  }

  async removeProfilePicture(): Promise<void> {
    const user = this.requireCurrentUser();
    const firestore = this.requireFirestore();
    await updateProfile(user, { photoURL: null });
    await setDoc(doc(firestore, 'users', user.uid), {
      photoURL: null,
      profileIcon: null,
      profilePictureType: null,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    await this.refreshUser();
  }

  toFriendlyError(error: unknown): string {
    if (error instanceof FirebaseError) {
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
        case 'auth/invalid-continue-uri':
          return 'The verification email redirect URL is invalid. Check the configured public app URL.';
        case 'auth/unauthorized-continue-uri':
          return 'Firebase is blocking the verification email redirect URL. Add the app domain to Firebase Auth authorized domains.';
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

    if (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof error.message === 'string' &&
      error.message.length > 0
    ) {
      const message = error.message.replace(/^Firebase:\s*/i, '').trim();
      if (message.length > 0 && message !== 'internal') {
        return message;
      }
    }

    return 'Something went wrong. Please try again.';
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

  private requireStorage(): FirebaseStorage {
    if (!this.storage) {
      throw new Error('Storage is only available in the browser.');
    }

    return this.storage;
  }

  private requireFunctions(): Functions {
    if (!this.functions) {
      throw new Error('Functions are only available in the browser.');
    }

    return this.functions;
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
    await this.loadUserProfile(user.uid);
  }

  private async loadUserProfile(userId: string): Promise<void> {
    const firestore = this.requireFirestore();
    const snapshot = await getDoc(doc(firestore, 'users', userId));
    if (!snapshot.exists()) {
      this.profile.set(null);
      return;
    }

    const data = snapshot.data() as Record<string, unknown>;
    this.profile.set({
      id: String(data['id'] ?? snapshot.id),
      authUid: String(data['authUid'] ?? snapshot.id),
      email: typeof data['email'] === 'string' ? data['email'] : null,
      emailVerified: data['emailVerified'] === true,
      displayName: typeof data['displayName'] === 'string' ? data['displayName'] : null,
      photoURL: typeof data['photoURL'] === 'string' ? data['photoURL'] : null,
      profileIcon: typeof data['profileIcon'] === 'string' ? data['profileIcon'] : null,
      profilePictureType: data['profilePictureType'] === 'icon' || data['profilePictureType'] === 'image'
        ? data['profilePictureType']
        : null,
      providers: Array.isArray(data['providers'])
        ? data['providers'].filter((provider): provider is string => typeof provider === 'string')
        : [],
      role: data['role'] === 'admin' ? 'admin' : 'user',
      pricingPlan: this.stringField(data, 'pricingPlan', 'pricing_plan'),
      businessPlan: this.stringField(data, 'businessPlan', 'business_plan'),
      subscriptionStatus: this.stringField(data, 'subscriptionStatus', 'subscription_status'),
      stripeSubscriptionId: this.stringField(data, 'stripeSubscriptionId', 'stripe_subscription_id'),
      creationTime: typeof data['creationTime'] === 'string' ? data['creationTime'] : null,
      lastSignInTime: typeof data['lastSignInTime'] === 'string' ? data['lastSignInTime'] : null,
    });
  }

  private stringField(data: Record<string, unknown>, ...keys: string[]): string | null {
    for (const key of keys) {
      const value = data[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }
    return null;
  }

  private async sendVerificationEmail(
    user: User,
    redirectTo?: string | null,
  ): Promise<boolean> {
    if (!this.userNeedsEmailVerification(user)) {
      return false;
    }

    const sendAccountVerificationEmail = httpsCallable<
      { redirectTo: string | null },
      { sent?: boolean; alreadyVerified?: boolean }
    >(this.requireFunctions(), 'sendAccountVerificationEmail');
    const result = await sendAccountVerificationEmail({
      redirectTo: this.isSafeRedirect(redirectTo) ? redirectTo : null,
    });

    return result.data.sent === true;
  }

  private getActionCodeSettings(
    flow: 'verifyEmailComplete' | 'resetPasswordComplete',
    redirectTo?: string | null,
  ): ActionCodeSettings | undefined {
    if (!this.isBrowser) {
      return undefined;
    }

    const url = new URL('/auth/action', this.getActionCodeBaseUrl());
    url.searchParams.set('flow', flow);

    if (this.isSafeRedirect(redirectTo)) {
      url.searchParams.set('redirectTo', redirectTo);
    }

    return {
      url: url.toString(),
      handleCodeInApp: false,
    };
  }

  private getActionCodeBaseUrl(): string {
    const configuredUrl = getPublicAppUrl();
    if (!configuredUrl) {
      return window.location.origin;
    }

    try {
      const url = new URL(configuredUrl);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return url.origin;
      }
    } catch {
      return window.location.origin;
    }

    return window.location.origin;
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
