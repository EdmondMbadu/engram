import { generateQrSvg } from './qr-code';

const COUNTRY_RING_IMAGE = '/assets/image/ring-countries.png';
const BADGE_BRAND_GREEN = '#3baf62';
const BADGE_BRAND_GREEN_DEEP = '#2a9150';

export function buildBusinessBadgeSvg(params: {
  businessName: string;
  chatUrl: string;
  iconCodes?: string[];
}): string {
  const business = escapeSvg(fitBadgeText(params.businessName).toUpperCase());
  const qr = generateQrSvg(params.chatUrl).replace(
    '<svg ',
    '<svg x="300" y="318" width="300" height="300" ',
  );
  const iconCodes = (params.iconCodes ?? []).filter(Boolean).slice(0, 4);
  const iconPositions = iconCodes.length <= 1
    ? [[450, 260]]
    : iconCodes.length === 2
      ? [[224, 450], [676, 450]]
      : iconCodes.length === 3
        ? [[224, 388], [676, 388], [224, 512]]
        : [[224, 382], [676, 382], [224, 518], [676, 518]];
  const icons = iconCodes.map((icon, index, all) => {
    const [x, y] = iconPositions[index] ?? iconPositions[0];
    return `<g transform="translate(${x} ${y})" filter="url(#coinShadow)"><circle r="43" fill="url(#coinFace)" stroke="#f4cd76" stroke-width="4"/><circle r="36" fill="#fff8ea" stroke="#b8872f" stroke-width="2"/><text y="14" text-anchor="middle" font-size="36">${iconEmoji(icon)}</text></g>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900">
    <defs>
      <radialGradient id="paper" cx="50%" cy="38%" r="68%"><stop offset="0" stop-color="#fff3cf"/><stop offset="0.58" stop-color="#e8be66"/><stop offset="1" stop-color="#a7651e"/></radialGradient>
      <linearGradient id="greenRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${BADGE_BRAND_GREEN}"/><stop offset="0.52" stop-color="#176b3d"/><stop offset="1" stop-color="${BADGE_BRAND_GREEN_DEEP}"/></linearGradient>
      <linearGradient id="goldEdge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0b8"/><stop offset="0.32" stop-color="#d7992b"/><stop offset="0.64" stop-color="#ffe39a"/><stop offset="1" stop-color="#8d5518"/></linearGradient>
      <linearGradient id="coinFace" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff8dc"/><stop offset="0.55" stop-color="#f0c66f"/><stop offset="1" stop-color="#b87422"/></linearGradient>
      <filter id="badgeShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="22" stdDeviation="18" flood-color="#050505" flood-opacity="0.38"/></filter>
      <filter id="coinShadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="8" stdDeviation="7" flood-color="#2b1a08" flood-opacity="0.38"/></filter>
      <filter id="textLift" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="2" flood-color="#001b10" flood-opacity="0.72"/></filter>
      <path id="topArc" d="M 132 464 A 318 318 0 0 1 768 464"/>
      <path id="bottomArc" d="M 176 606 A 300 300 0 0 0 724 606"/>
    </defs>
    <rect width="900" height="900" fill="none"/>
    <g filter="url(#badgeShadow)">
      <image href="${COUNTRY_RING_IMAGE}" x="0" y="0" width="900" height="900" preserveAspectRatio="xMidYMid meet"/>
      <circle cx="450" cy="450" r="424" fill="none" stroke="url(#goldEdge)" stroke-width="18"/>
      <circle cx="450" cy="450" r="340" fill="none" stroke="url(#greenRing)" stroke-width="76"/>
      <circle cx="450" cy="450" r="379" fill="none" stroke="url(#goldEdge)" stroke-width="8"/>
      <circle cx="450" cy="450" r="300" fill="none" stroke="url(#goldEdge)" stroke-width="9"/>
      <circle cx="450" cy="450" r="292" fill="url(#paper)" stroke="#8f591e" stroke-width="3"/>
      <circle cx="450" cy="450" r="228" fill="none" stroke="#f8d98b" stroke-width="2" opacity="0.72"/>
      <path d="M270 624c52 54 116 82 180 82s128-28 180-82" fill="none" stroke="#9c651f" stroke-width="15" stroke-linecap="round" opacity="0.36"/>
      <path d="M300 620c42 33 91 50 150 50s108-17 150-50" fill="none" stroke="#ffe29a" stroke-width="6" stroke-linecap="round" opacity="0.8"/>
      <circle cx="450" cy="248" r="34" fill="url(#coinFace)" stroke="#7f4d16" stroke-width="4"/>
      <circle cx="450" cy="248" r="25" fill="url(#greenRing)" stroke="#ffe39a" stroke-width="3"/>
      <text x="450" y="258" text-anchor="middle" font-size="28">🌍</text>
      <text font-family="Inter, Arial, sans-serif" font-size="42" font-weight="900" fill="#f8f8f2" dy="15" filter="url(#textLift)"><textPath href="#topArc" startOffset="50%" text-anchor="middle" textLength="610" lengthAdjust="spacingAndGlyphs">${business} • LivingWiki Chat</textPath></text>
      <text font-family="Inter, Arial, sans-serif" font-size="48" font-weight="900" fill="#f8f8f2" dy="22" filter="url(#textLift)"><textPath href="#bottomArc" startOffset="50%" text-anchor="middle" textLength="470" lengthAdjust="spacingAndGlyphs">60+ Languages</textPath></text>
    </g>
    <rect x="270" y="288" width="360" height="360" rx="28" fill="#fffdf6" stroke="url(#goldEdge)" stroke-width="8" filter="url(#coinShadow)"/>
    <rect x="286" y="304" width="328" height="328" rx="18" fill="#ffffff" stroke="#f1d48b" stroke-width="2"/>
    ${qr}
    ${icons}
    <rect x="290" y="664" width="320" height="42" rx="21" fill="url(#goldEdge)" stroke="#8f591e" stroke-width="2"/>
    <text x="450" y="692" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="900" fill="#10391f">Powered by LivingWiki.com</text>
    <text x="450" y="746" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="900" fill="#f5d780" filter="url(#coinShadow)">★ ★ ★ ★ ★</text>
  </svg>`;
}

function iconEmoji(code: string): string {
  const icons: Record<string, string> = {
    bakery: '🥐',
    beer: '🍺',
    cocktail: '🍸',
    coffee: '☕',
    gallery: '🎨',
    bread: '🥐',
    burger: '🍔',
    hat: '🎩',
    hotel: '🏨',
    local: '📍',
    market: '🛍️',
    music: '🎵',
    pretzel: '🥨',
    pizza: '🍕',
    restaurant: '🍽️',
    service: '🧰',
    shop: '🛍️',
    sushi: '🍣',
    taco: '🌮',
    wine: '🍷',
  };
  return icons[code] ?? '⭐';
}

function escapeSvg(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fitBadgeText(value: string): string {
  const clean = value.trim() || 'Your business';
  return clean.length > 26 ? `${clean.slice(0, 23).trim()}...` : clean;
}
