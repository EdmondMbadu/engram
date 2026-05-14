import { Injectable } from '@angular/core';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

@Injectable({ providedIn: 'root' })
export class GoogleAdSenseService {
  private loadingClientId: string | null = null;
  private scriptLoad: Promise<void> | null = null;

  async requestAd(clientId: string): Promise<void> {
    const normalizedClientId = clientId.trim();
    if (!normalizedClientId || typeof window === 'undefined') {
      return;
    }

    await this.loadScript(normalizedClientId);

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // Google can throw when an ad blocker or duplicate render blocks the slot.
    }
  }

  private loadScript(clientId: string): Promise<void> {
    if (typeof document === 'undefined') {
      return Promise.resolve();
    }

    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-living-wiki-adsense="true"]',
    );
    if (existing?.dataset['loaded'] === 'true') {
      return Promise.resolve();
    }
    if (this.scriptLoad && this.loadingClientId === clientId) {
      return this.scriptLoad;
    }

    this.loadingClientId = clientId;
    this.scriptLoad = new Promise<void>((resolve, reject) => {
      const script = existing ?? document.createElement('script');
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.dataset['livingWikiAdsense'] = 'true';
      script.dataset['clientId'] = clientId;
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(clientId)}`;
      script.onload = () => {
        script.dataset['loaded'] = 'true';
        resolve();
      };
      script.onerror = () => {
        this.loadingClientId = null;
        this.scriptLoad = null;
        reject(new Error('Failed to load Google AdSense.'));
      };

      if (!existing) {
        document.head.appendChild(script);
      }
    });

    return this.scriptLoad;
  }
}
