import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Marketing / public pages can be prerendered
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'business', renderMode: RenderMode.Prerender },
  { path: 'business/claim', renderMode: RenderMode.Client },
  { path: 'business/:citySlug/:businessSlug/edit', renderMode: RenderMode.Client },
  { path: 'business/:citySlug/:businessSlug/voice', renderMode: RenderMode.Client },
  { path: 'business/:citySlug/:businessSlug/chat', renderMode: RenderMode.Client },
  { path: 'business/:citySlug/:businessSlug', renderMode: RenderMode.Client },

  // Dymaxion map reads public atlases from Firebase + measures the DOM — client-render
  { path: 'dymaxion', renderMode: RenderMode.Client },
  { path: 'fence-line', renderMode: RenderMode.Prerender },

  // Auth pages must be client-rendered (they use browser-only Firebase Auth)
  { path: 'sign-in', renderMode: RenderMode.Client },
  { path: 'create-account', renderMode: RenderMode.Client },
  { path: 'forgot-password', renderMode: RenderMode.Client },
  { path: 'verify-email', renderMode: RenderMode.Client },
  { path: 'auth/action', renderMode: RenderMode.Client },

  // Guarded pages require auth state — client-render them
  { path: 'home', renderMode: RenderMode.Client },
  { path: 'discover', renderMode: RenderMode.Client },
  { path: 'all-cities', renderMode: RenderMode.Client },
  { path: 'trove', renderMode: RenderMode.Prerender },
  { path: 'wikis', renderMode: RenderMode.Client },
  { path: 'videos', renderMode: RenderMode.Client },
  { path: 'boards', renderMode: RenderMode.Client },
  { path: 'songs', renderMode: RenderMode.Client },
  { path: 'trips', renderMode: RenderMode.Client },
  { path: 'friends', renderMode: RenderMode.Client },
  { path: 'boards/u/:ownerKey', renderMode: RenderMode.Client },
  { path: 'boards/:boardId', renderMode: RenderMode.Client },
  { path: 'songs/:boardId', renderMode: RenderMode.Client },
  { path: 'trips/:boardId', renderMode: RenderMode.Client },
  { path: 'upload/:slug', renderMode: RenderMode.Client },
  { path: 'upload', renderMode: RenderMode.Client },
  { path: 'chat/shared/:threadId', renderMode: RenderMode.Client },
  { path: 'answer-card/:cardId', renderMode: RenderMode.Client },
  { path: 'quiz/:quizId', renderMode: RenderMode.Client },
  { path: 'places/:slug', renderMode: RenderMode.Client },
  { path: 'chat/:slug/boards', renderMode: RenderMode.Client },
  { path: 'chat/:slug', renderMode: RenderMode.Client },
  { path: 'chat', renderMode: RenderMode.Client },
  { path: 'library/:slug', renderMode: RenderMode.Client },
  { path: 'library', renderMode: RenderMode.Client },
  { path: 'scrapper', renderMode: RenderMode.Client },
  { path: 'wiki', renderMode: RenderMode.Client },
  { path: 'wiki/:slug', renderMode: RenderMode.Client },
  { path: 'atlases', renderMode: RenderMode.Client },
  { path: 'atlases/:atlasId/persona', renderMode: RenderMode.Client },
  { path: 'atlas/:slug/green-jobs', renderMode: RenderMode.Client },
  { path: 'atlas/:slug/worldometers', renderMode: RenderMode.Client },
  { path: 'atlas/:slug', renderMode: RenderMode.Client },

  // Fallback
  { path: '**', renderMode: RenderMode.Prerender },
];
