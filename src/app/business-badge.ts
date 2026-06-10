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
    '<svg x="260" y="260" width="380" height="380" ',
  );
  const iconCodes = (params.iconCodes ?? []).filter(Boolean).slice(0, 4);
  const icons = iconCodes.map((icon, index, all) => {
    const angle = -155 + (all.length <= 1 ? 0 : (310 / Math.max(1, all.length - 1)) * index);
    const radians = angle * Math.PI / 180;
    const x = 450 + Math.cos(radians) * 275;
    const y = 450 + Math.sin(radians) * 275;
    return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle r="34" fill="#fff8ea" stroke="#b98834" stroke-width="4"/><text y="11" text-anchor="middle" font-size="32">${iconEmoji(icon)}</text></g>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900">
    <defs>
      <radialGradient id="paper" cx="50%" cy="42%" r="62%"><stop offset="0" stop-color="#f5e4c5"/><stop offset="0.68" stop-color="#dfc28d"/><stop offset="1" stop-color="#c79d56"/></radialGradient>
      <linearGradient id="tealRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${BADGE_BRAND_GREEN}"/><stop offset="1" stop-color="${BADGE_BRAND_GREEN_DEEP}"/></linearGradient>
      <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#12323a" flood-opacity="0.28"/></filter>
      <path id="topArc" d="M 112 472 A 338 338 0 0 1 788 472"/>
      <path id="bottomArc" d="M 186 606 A 310 310 0 0 0 714 606"/>
    </defs>
    <rect width="900" height="900" fill="none"/>
    <image href="${COUNTRY_RING_IMAGE}" x="0" y="0" width="900" height="900" preserveAspectRatio="xMidYMid meet"/>
    <circle cx="450" cy="450" r="335" fill="none" stroke="url(#tealRing)" stroke-width="46" opacity="0.96"/>
    <circle cx="450" cy="450" r="300" fill="url(#paper)" stroke="#b8842f" stroke-width="5" filter="url(#softShadow)"/>
    <circle cx="450" cy="450" r="210" fill="none" stroke="#a47729" stroke-width="4" stroke-dasharray="24 28"/>
    <text font-family="Inter, Arial, sans-serif" font-size="32" font-weight="900" fill="#ffffff" dy="12"><textPath href="#topArc" startOffset="50%" text-anchor="middle" textLength="610" lengthAdjust="spacingAndGlyphs">${business} • LivingWiki Chat</textPath></text>
    <text font-family="Inter, Arial, sans-serif" font-size="40" font-weight="900" fill="#ffffff" dy="20"><textPath href="#bottomArc" startOffset="50%" text-anchor="middle" textLength="410" lengthAdjust="spacingAndGlyphs">60+ Languages</textPath></text>
    <rect x="242" y="242" width="416" height="416" rx="24" fill="#fff8ea" stroke="#b8842f" stroke-width="5"/>
    ${qr}
    ${icons}
    <text x="450" y="746" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="900" fill="#0f596d">Powered by LivingWiki.com</text>
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
