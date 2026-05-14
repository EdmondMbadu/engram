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

export interface GoogleMapsRuntimeConfig {
  apiKey?: string;
  mapId?: string;
};

export interface GoogleAdSenseRuntimeConfig {
  clientId?: string;
  phillyBottomSlotId?: string;
};

declare global {
  interface Window {
    __LIVING_ATLAS_CONFIG__?: {
      firebase?: PublicFirebaseConfig;
      publicAppUrl?: string;
      googleDrive?: GoogleDriveRuntimeConfig;
      googleMaps?: GoogleMapsRuntimeConfig;
      googleAdSense?: GoogleAdSenseRuntimeConfig;
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

export function getGoogleMapsConfig(): {
  apiKey: string | null;
  mapId: string | null;
} {
  const configured = window.__LIVING_ATLAS_CONFIG__?.googleMaps;
  const firebase = getFirebaseConfig();

  const apiKey = typeof configured?.apiKey === 'string' && configured.apiKey.trim()
    ? configured.apiKey.trim()
    : (typeof firebase.apiKey === 'string' && firebase.apiKey.trim() ? firebase.apiKey.trim() : null);
  const mapId = typeof configured?.mapId === 'string' && configured.mapId.trim()
    ? configured.mapId.trim()
    : null;

  return { apiKey, mapId };
}

export function getGoogleAdSenseConfig(): {
  clientId: string | null;
  phillyBottomSlotId: string | null;
} {
  const configured = window.__LIVING_ATLAS_CONFIG__?.googleAdSense;
  const clientId = typeof configured?.clientId === 'string' && configured.clientId.trim()
    ? configured.clientId.trim()
    : null;
  const phillyBottomSlotId = typeof configured?.phillyBottomSlotId === 'string' && configured.phillyBottomSlotId.trim()
    ? configured.phillyBottomSlotId.trim()
    : null;

  return { clientId, phillyBottomSlotId };
}
