type TourStopCandidate = {
  title?: string;
  subtitle?: string;
  notes?: string;
  tour?: {
    address?: string;
    guideScript?: string;
    lat?: number | null;
    lng?: number | null;
  } | null;
};

export function tourStopDestinationQuery(value: string): string {
  const input = value.replace(/\s+/g, ' ').trim();
  if (!input) {
    return '';
  }

  const markdownLink = input.match(/\[([^\]]+)\]\(\s*(https?:\/\/[^)\s]+)\s*\)/i);
  if (markdownLink?.[1]?.trim()) {
    return cleanTourStopDestination(markdownLink[1]);
  }

  const withoutUrls = input.replace(/https?:\/\/\S+/gi, ' ').replace(/\s+/g, ' ').trim();
  if (withoutUrls) {
    return cleanTourStopDestination(withoutUrls);
  }

  const rawUrl = input.match(/https?:\/\/\S+/i)?.[0];
  if (!rawUrl) {
    return input;
  }

  try {
    const url = new URL(rawUrl);
    const lastPathPart = url.pathname.split('/').filter(Boolean).at(-1) ?? '';
    const fromPath = decodeURIComponent(lastPathPart)
      .replace(/\.[a-z0-9]{2,5}$/i, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return cleanTourStopDestination(fromPath || url.hostname.replace(/^www\./i, ''));
  } catch {
    return cleanTourStopDestination(input);
  }
}

function cleanTourStopDestination(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/[*_~`]+/g, '')
    .replace(/\\([\\[\]()])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isGenericTourStopFallback(candidate: TourStopCandidate | null): boolean {
  if (!candidate) {
    return false;
  }
  const title = candidate.title?.trim().toLowerCase() ?? '';
  const subtitle = candidate.subtitle?.trim().toLowerCase() ?? '';
  const notes = candidate.notes?.trim().toLowerCase() ?? '';
  const guideScript = candidate.tour?.guideScript?.trim().toLowerCase() ?? '';

  return title.startsWith('create exactly one new stop')
    || (
      /^stop \d+$/.test(subtitle)
      && notes.startsWith('draft tour stop for ')
      && !candidate.tour?.address?.trim()
      && candidate.tour?.lat == null
      && candidate.tour?.lng == null
    )
    || guideScript.includes('this is a generated starting point for');
}
