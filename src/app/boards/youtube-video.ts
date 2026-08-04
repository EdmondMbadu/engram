const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export function youtubeVideoIdFromReference(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  if (YOUTUBE_VIDEO_ID_PATTERN.test(raw)) return raw;
  const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0] ?? '';
      return YOUTUBE_VIDEO_ID_PATTERN.test(id) ? id : '';
    }
    if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      const parts = url.pathname.split('/').filter(Boolean);
      const id = url.pathname === '/watch'
        ? url.searchParams.get('v') ?? ''
        : ['embed', 'shorts', 'live'].includes(parts[0] ?? '')
          ? parts[1] ?? ''
          : '';
      return YOUTUBE_VIDEO_ID_PATTERN.test(id) ? id : '';
    }
  } catch {
    return '';
  }
  return '';
}

export function youtubeWatchUrl(videoId: string): string {
  return youtubeVideoIdFromReference(videoId)
    ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
    : '';
}

export function youtubePrivacyEmbedUrl(videoId: string): string {
  const normalized = youtubeVideoIdFromReference(videoId);
  if (!normalized) return '';
  const url = new URL(`https://www.youtube-nocookie.com/embed/${normalized}`);
  url.searchParams.set('autoplay', '1');
  url.searchParams.set('playsinline', '1');
  url.searchParams.set('rel', '0');
  return url.toString();
}
