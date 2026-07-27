export const spotifyOAuthCallbackPath = '/auth/spotify/callback';

/**
 * Keep the production Spotify callback on LivingWiki's public domain so the
 * allowlisted URI does not depend on a Firebase project, region, or runtime.
 */
export function resolveSpotifyOAuthRedirectUri(
  configuredValue: string | undefined,
  publicAppUrl: string,
): string {
  const fallback = `${publicAppUrl.trim().replace(/\/+$/, '')}${spotifyOAuthCallbackPath}`;
  const configured = configuredValue?.trim();
  if (!configured) {
    return fallback;
  }

  try {
    const url = new URL(configured);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
      return fallback;
    }
    return configured;
  } catch {
    return fallback;
  }
}
