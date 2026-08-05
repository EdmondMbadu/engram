export type YouTubeWebSearchResult = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  durationSeconds: number;
};

type TextValue = {
  simpleText?: unknown;
  runs?: Array<{ text?: unknown }>;
};

function textValue(value: unknown): string {
  const data = value && typeof value === 'object' ? value as TextValue : {};
  if (typeof data.simpleText === 'string') return data.simpleText;
  return Array.isArray(data.runs)
    ? data.runs.map((run) => typeof run.text === 'string' ? run.text : '').join('')
    : '';
}

function durationSeconds(value: string): number {
  const parts = value.split(':').map((part) => Number(part.trim()));
  if (!parts.length || parts.some((part) => !Number.isFinite(part) || part < 0)) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function jsonObjectFollowingMarker(html: string, marker: string): unknown {
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return null;
  const start = html.indexOf('{', markerIndex + marker.length);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < html.length; index += 1) {
    const char = html[index]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, index + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function initialData(html: string): unknown {
  for (const marker of ['var ytInitialData =', 'window["ytInitialData"] =', 'ytInitialData =']) {
    const value = jsonObjectFollowingMarker(html, marker);
    if (value) return value;
  }
  return null;
}

export function extractYouTubeWebSearchResults(
  html: string,
  maxResults = 8,
): YouTubeWebSearchResult[] {
  const root = initialData(html);
  if (!root) return [];
  const results: YouTubeWebSearchResult[] = [];
  const seen = new Set<string>();
  const visit = (value: unknown): void => {
    if (results.length >= maxResults || !value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    const data = value as Record<string, unknown>;
    const renderer = data.videoRenderer && typeof data.videoRenderer === 'object'
      ? data.videoRenderer as Record<string, unknown>
      : null;
    if (renderer) {
      const videoId = typeof renderer.videoId === 'string' ? renderer.videoId : '';
      const title = textValue(renderer.title).replace(/\s+/g, ' ').trim();
      if (/^[A-Za-z0-9_-]{11}$/.test(videoId) && title && !seen.has(videoId)) {
        const thumbnailData = renderer.thumbnail && typeof renderer.thumbnail === 'object'
          ? renderer.thumbnail as { thumbnails?: Array<{ url?: unknown; width?: unknown; height?: unknown }> }
          : {};
        const thumbnails = Array.isArray(thumbnailData.thumbnails) ? thumbnailData.thumbnails : [];
        const thumbnail = [...thumbnails].sort((left, right) =>
          (Number(right.width) || 0) * (Number(right.height) || 0)
          - (Number(left.width) || 0) * (Number(left.height) || 0))[0];
        seen.add(videoId);
        results.push({
          videoId,
          title,
          channelTitle: textValue(renderer.ownerText || renderer.longBylineText).replace(/\s+/g, ' ').trim(),
          thumbnailUrl: typeof thumbnail?.url === 'string' ? thumbnail.url : '',
          durationSeconds: durationSeconds(textValue(renderer.lengthText)),
        });
      }
    }
    for (const child of Object.values(data)) visit(child);
  };
  visit(root);
  return results.slice(0, Math.max(0, Math.trunc(maxResults)));
}
