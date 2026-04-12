import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics';
import { getFirebaseConfig } from './firebase.config';

let analyticsPromise: Promise<Analytics | null> | null = null;

export function getFirebaseApp(): FirebaseApp {
  return getApps().length > 0 ? getApp() : initializeApp(getFirebaseConfig());
}

export function initializeFirebaseClient(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const app = getFirebaseApp();

  analyticsPromise ??= isSupported()
    .then((supported) => (supported ? getAnalytics(app) : null))
    .catch(() => null);
}

export function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (!analyticsPromise) {
    initializeFirebaseClient();
  }

  return analyticsPromise ?? Promise.resolve(null);
}
