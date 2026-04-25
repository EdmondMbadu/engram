import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Marketing / public pages can be prerendered
  { path: '', renderMode: RenderMode.Prerender },

  // Auth pages must be client-rendered (they use browser-only Firebase Auth)
  { path: 'sign-in', renderMode: RenderMode.Client },
  { path: 'create-account', renderMode: RenderMode.Client },
  { path: 'forgot-password', renderMode: RenderMode.Client },
  { path: 'verify-email', renderMode: RenderMode.Client },
  { path: 'auth/action', renderMode: RenderMode.Client },

  // Guarded pages require auth state — client-render them
  { path: 'home', renderMode: RenderMode.Client },
  { path: 'wikis', renderMode: RenderMode.Client },
  { path: 'upload/:slug', renderMode: RenderMode.Client },
  { path: 'upload', renderMode: RenderMode.Client },
  { path: 'chat/:slug', renderMode: RenderMode.Client },
  { path: 'chat', renderMode: RenderMode.Client },
  { path: 'library/:slug', renderMode: RenderMode.Client },
  { path: 'library', renderMode: RenderMode.Client },
  { path: 'scrapper', renderMode: RenderMode.Client },
  { path: 'wiki', renderMode: RenderMode.Client },
  { path: 'wiki/:slug', renderMode: RenderMode.Client },
  { path: 'atlases', renderMode: RenderMode.Client },
  { path: 'atlas/:slug', renderMode: RenderMode.Client },

  // Fallback
  { path: '**', renderMode: RenderMode.Prerender },
];
