import type { FirebaseOptions } from 'firebase/app';

export type PublicFirebaseConfig = FirebaseOptions & {
  measurementId?: string;
};

declare global {
  interface Window {
    __LIVING_ATLAS_CONFIG__?: {
      firebase?: PublicFirebaseConfig;
      publicAppUrl?: string;
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
