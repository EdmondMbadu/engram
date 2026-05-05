import type { FirebaseOptions } from 'firebase/app';

export type PublicFirebaseConfig = FirebaseOptions & {
  measurementId?: string;
  messagingSenderId?: string;
};

export interface GoogleDriveRuntimeConfig {
  apiKey?: string;
  clientId?: string;
  appId?: string;
};

declare global {
  interface Window {
    __LIVING_ATLAS_CONFIG__?: {
      firebase?: PublicFirebaseConfig;
      publicAppUrl?: string;
      googleDrive?: GoogleDriveRuntimeConfig;
    };
  }
}

export function getFirebaseConfig(): PublicFirebaseConfig {
  const config = window.__LIVING_ATLAS_CONFIG__?.firebase;

  if (!config) {
    throw new Error(
      'Missing Firebase runtime config. Create public/runtime-config.js from the template.',
    );
  }

  return config;
}

export function getPublicAppUrl(): string | null {
  const configured = window.__LIVING_ATLAS_CONFIG__?.publicAppUrl;
  if (typeof configured === 'string' && configured.trim()) {
    return configured.trim().replace(/\/+$/, '');
  }

  return null;
}

export function getGoogleDriveConfig(): {
  apiKey: string | null;
  clientId: string | null;
  appId: string | null;
} {
  const configured = window.__LIVING_ATLAS_CONFIG__?.googleDrive;
  const firebase = getFirebaseConfig();

  const apiKey = typeof configured?.apiKey === 'string' && configured.apiKey.trim()
    ? configured.apiKey.trim()
    : (typeof firebase.apiKey === 'string' && firebase.apiKey.trim() ? firebase.apiKey.trim() : null);
  const clientId = typeof configured?.clientId === 'string' && configured.clientId.trim()
    ? configured.clientId.trim()
    : null;
  const appId = typeof configured?.appId === 'string' && configured.appId.trim()
    ? configured.appId.trim()
    : (typeof firebase.messagingSenderId === 'string' && firebase.messagingSenderId.trim()
        ? firebase.messagingSenderId.trim()
        : null);

  return { apiKey, clientId, appId };
}
