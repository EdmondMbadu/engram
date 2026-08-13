import { createHash, randomUUID } from 'node:crypto';

const userAgent = 'LivingWiki university-board image resolver/1.0 (https://livingwiki.com)';
const supportedTypes = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);
const editorialImageOverrides = new Map([
  ['R7vDLuceL2A5qCQUw4IA\0Charlotte Alletag Commuter Lounge', {
    imageUrl: 'https://drexel.edu/~/media/Drexel/Core-Site-Group/Core/Images/admissions/virtual-tour/rush-building.jpg',
    sourceUrl: 'https://drexel.edu/admissions/virtual-tour/self-guided-walking-tour',
    sourceLabel: 'Drexel University · Rush Student Center', license: '', provider: 'editorial-official',
    title: 'Rush Student Center, home of Charlotte Alletag Commuter Lounge',
  }],
  ['R7vDLuceL2A5qCQUw4IA\0Main 220 Lounge', {
    imageUrl: 'https://drexel.edu/~/media/Drexel/Core-Site-Group/Core/Images/admissions/virtual-tour/main-building-desktop.jpg',
    sourceUrl: 'https://drexel.edu/admissions/virtual-tour/self-guided-walking-tour',
    sourceLabel: 'Drexel University · Main Building tour', license: '', provider: 'editorial-official',
    title: 'Main Building, home of Main 220 Lounge',
  }],
  ['R7vDLuceL2A5qCQUw4IA\0Main Building and Great Court', {
    imageUrl: 'https://drexel.edu/news/~/media/Drexel/Core-Site-Group/News/Images/v2/story-images/2022/February/IMG_5211/img_5211_16x9.jpg?hash=169EF98E312D82183A03DDD1684E11BD&w=3200',
    sourceUrl: 'https://drexel.edu/news/archive/2022/February/a-new-old-look-for-main-building-ceiling',
    sourceLabel: 'DrexelNOW · Main Building Great Court', license: '', provider: 'editorial-official',
    title: 'The restored Great Court in Drexel Main Building',
  }],
  ['R7vDLuceL2A5qCQUw4IA\0Mario the Magnificent', {
    imageUrl: 'https://drexel.edu/~/media/Drexel/Core-Site-Group/Core/Images/admissions/virtual-tour/mario.jpg',
    sourceUrl: 'https://drexel.edu/admissions/virtual-tour/explore-by-map',
    sourceLabel: 'Drexel University virtual tour · Mario the Magnificent', license: '', provider: 'editorial-official',
    title: 'Mario the Magnificent dragon statue',
  }],
  ['R7vDLuceL2A5qCQUw4IA\0Race Street Walk', {
    imageUrl: 'https://drexel.edu/~/media/Drexel/Core-Site-Group/Core/Images/admissions/virtual-tour/race-street-walk-desktop/race-street-walk-desktop_16x9.jpg',
    sourceUrl: 'https://drexel.edu/admissions/virtual-tour/explore-by-map',
    sourceLabel: 'Drexel University virtual tour · Race Street Walk', license: '', provider: 'editorial-official',
    title: 'Race Street Walk and the Library Learning Terrace',
  }],
  ['R7vDLuceL2A5qCQUw4IA\0Rush Building', {
    imageUrl: 'https://drexel.edu/~/media/Drexel/Core-Site-Group/Core/Images/admissions/virtual-tour/rush-building/rush-building_16x9.jpg',
    sourceUrl: 'https://drexel.edu/admissions/virtual-tour/explore-by-map',
    sourceLabel: 'Drexel University virtual tour · Rush Building', license: '', provider: 'editorial-official',
    title: 'Rush Building',
  }],
  ['R7vDLuceL2A5qCQUw4IA\0Drexel Park', {
    imageUrl: 'https://drexel.edu/~/media/Drexel/Core-Site-Group/Core/Images/admissions/virtual-tour/drexel-park-desktop/drexel-park-desktop_16x9.jpg',
    sourceUrl: 'https://drexel.edu/admissions/virtual-tour/explore-by-map',
    sourceLabel: 'Drexel University virtual tour · Drexel Park', license: '', provider: 'editorial-official',
    title: 'Drexel Park',
  }],
  ['R7vDLuceL2A5qCQUw4IA\0Library Learning Terrace', {
    imageUrl: 'https://drexel.edu/~/media/Drexel/Core-Site-Group/Core/Images/admissions/virtual-tour/race-street-walk-desktop.jpg',
    sourceUrl: 'https://drexel.edu/admissions/virtual-tour/self-guided-walking-tour',
    sourceLabel: 'Drexel University · Race Street Walk and Library Learning Terrace', license: '', provider: 'editorial-official',
    title: 'Race Street Walk at the Library Learning Terrace',
  }],
  ['R7vDLuceL2A5qCQUw4IA\0Dragons’ Learning Den Practice Zone', {
    imageUrl: 'https://d68g328n4ug0e.cloudfront.net/misc/1428/eq/item/2025_07_16_12_16_07.jpg',
    sourceUrl: 'https://libcal.library.drexel.edu/space/125007',
    sourceLabel: 'Drexel University Libraries · Practice Zone', license: '', provider: 'editorial-official',
    title: 'Practice Zone in the Dragons’ Learning Den',
  }],
  ['R7vDLuceL2A5qCQUw4IA\0Hagerty Library second-floor silent study', {
    imageUrl: 'https://drexel.edu/provost/~/media/Drexel/Provost-Group/Provost/Images/libraries-collections-archives/2nd-fl_Hagerty-Library_April-2023/2nd-fl_hagerty-library_april-2023_16x9/2nd-fl_hagerty-library_april-2023_16x9_160x53.jpg',
    sourceUrl: 'https://drexel.edu/provost/offices/libraries-collections-archives',
    sourceLabel: 'Drexel University · Hagerty Library second floor', license: '', provider: 'editorial-official',
    title: 'Second-floor study area in W. W. Hagerty Library',
  }],
  ['R7vDLuceL2A5qCQUw4IA\0Main 220 conference space', {
    imageUrl: 'https://drexel.edu/~/media/Drexel/Core-Site-Group/Core/Images/admissions/virtual-tour/main-building-desktop.jpg',
    sourceUrl: 'https://drexel.edu/admissions/virtual-tour/self-guided-walking-tour',
    sourceLabel: 'Drexel University · Main Building tour', license: '', provider: 'editorial-official',
    title: 'Main Building, home of the Main 220 conference space',
  }],
  ['R7vDLuceL2A5qCQUw4IA\0Charlotte Alletag Commuter Lounge tables', {
    imageUrl: 'https://drexel.edu/~/media/Drexel/Core-Site-Group/Core/Images/admissions/virtual-tour/rush-building.jpg',
    sourceUrl: 'https://drexel.edu/admissions/virtual-tour/self-guided-walking-tour',
    sourceLabel: 'Drexel University · Rush Student Center', license: '', provider: 'editorial-official',
    title: 'Rush Student Center, home of Charlotte Alletag Commuter Lounge',
  }],
  ['R7vDLuceL2A5qCQUw4IA\0Library Learning Terrace adjustable-seating area', {
    imageUrl: 'https://drexel.edu/~/media/Drexel/Core-Site-Group/Core/Images/admissions/virtual-tour/race-street-walk-desktop.jpg',
    sourceUrl: 'https://drexel.edu/admissions/virtual-tour/self-guided-walking-tour',
    sourceLabel: 'Drexel University · Race Street Walk and Library Learning Terrace', license: '', provider: 'editorial-official',
    title: 'Race Street Walk at the Library Learning Terrace',
  }],
  ['R7vDLuceL2A5qCQUw4IA\0Homecoming bonfire on Lancaster Walk', {
    imageUrl: 'https://drexel.edu/news/~/media/Drexel/Core-Site-Group/News/Images/v2/story-images/2026/January/2019Bonfire/2019bonfire_16x9.jpg',
    sourceUrl: 'https://drexel.edu/news/archive/2026/January/homecoming-preview-2026',
    sourceLabel: 'DrexelNOW · Homecoming Bonfire', license: '', provider: 'editorial-official',
    title: 'Drexel Homecoming Bonfire on Lancaster Walk',
  }],
  ['R7vDLuceL2A5qCQUw4IA\0Winter Homecoming', {
    imageUrl: 'https://drexel.edu/news/~/media/Drexel/Core-Site-Group/News/Images/v2/story-images/2026/January/hoco/hoco_16x9.jpeg?hash=52E369BC60979B11B9F24514067FE1B9&w=3200',
    sourceUrl: 'https://drexel.edu/news/archive/2026/January/winter-events-2026',
    sourceLabel: 'DrexelNOW · Winter Homecoming', license: '', provider: 'editorial-official',
    title: 'Students and administrators at Drexel Homecoming',
  }],
  ['R7vDLuceL2A5qCQUw4IA\0Welcome Week', {
    imageUrl: 'https://drexel.edu/news/~/media/Drexel/Core-Site-Group/News/Images/v2/story-images/2023/September/AJD-bday2-copy/ajd-bday2-copy_16x9.jpeg',
    sourceUrl: 'https://drexel.edu/news/archive/2023/September/welcome-week-2023',
    sourceLabel: 'DrexelNOW · Welcome Week', license: '', provider: 'editorial-official',
    title: 'Students celebrate Drexel Welcome Week',
  }],
  ['R7vDLuceL2A5qCQUw4IA\0Franklin Institute Welcome Week class photo', {
    imageUrl: 'https://drexel.edu/news/~/media/Drexel/Core-Site-Group/News/Images/v2/story-images/2024/September/Franklinstudents-copy.jpg',
    sourceUrl: 'https://drexel.edu/news/archive/2024/September/welcome-week-2024',
    sourceLabel: 'DrexelNOW · Franklin Institute Welcome Week', license: '', provider: 'editorial-official',
    title: 'Incoming Drexel students at the Franklin Institute',
  }],
  ['R7vDLuceL2A5qCQUw4IA\0President’s Toast', {
    imageUrl: 'https://drexel.edu/news/~/media/Drexel/Core-Site-Group/News/Images/v2/story-images/2026/June/PresidentsToast/IMG_0453.JPG?as=0&h=3648&hash=9509825BFBC9F9C14513723C3D6A201A&w=6485',
    sourceUrl: 'https://drexel.edu/news/archive/2026/June/presidents-toast',
    sourceLabel: 'DrexelNOW · President’s Toast 2026', license: '', provider: 'editorial-official',
    title: 'Drexel students raise their glasses at the President’s Toast',
  }],
  ['R7vDLuceL2A5qCQUw4IA\0DragonFly concert series', {
    imageUrl: 'https://www.thetriangle.org/proxy/wp-content/uploads/2025/10/BZ9A9357-1024x683.jpg',
    sourceUrl: 'https://www.thetriangle.org/article/dragonfly-2025-brings-glowsticks-and-gravy-to-the-dac',
    sourceLabel: 'The Triangle · DragonFly 2025 · Kasey Shamis', license: '', provider: 'editorial-student-media',
    title: 'Students at Drexel DragonFly 2025',
  }],
  ['R7vDLuceL2A5qCQUw4IA\0Dragons’ Learning Den Vending Area', {
    imageUrl: 'https://library.drexel.edu/~/media/Drexel/Provost-Group/Library/Images/images/laptop-charger-kiosk-oct-2018.JPG?hash=29D3D1CA3AB58F88F0F1ADF2B06F1220&w=3200',
    sourceUrl: 'https://library.drexel.edu/news-and-events/news/2018/october/new-lending_kiosks',
    sourceLabel: 'Drexel University Libraries · Dragons’ Learning Den kiosk', license: '', provider: 'editorial-official',
    title: 'The 24/7 self-service area inside Dragons’ Learning Den',
  }],
  ['R7vDLuceL2A5qCQUw4IA\0Serenity Suite', {
    imageUrl: 'https://library.drexel.edu/~/media/Drexel/Provost-Group/Library/Images/Physical-Locations/Serenity-Suite-sign/serenity-suite-sign_16x9.jpg',
    sourceUrl: 'https://library.drexel.edu/news-and-events/programs-and-initiatives/Wellness-Room/',
    sourceLabel: 'Drexel University Libraries · Serenity Suite', license: '', provider: 'editorial-official',
    title: 'Serenity Suite in the Dragons’ Learning Den',
  }],
  ['R7vDLuceL2A5qCQUw4IA\0ICA Philadelphia', {
    imageUrl: 'https://icaphila.org/wp-content/uploads/2025/08/Southern-Clairaudience_NC-install-view_6-scaled.jpg',
    sourceUrl: 'https://icaphila.org/',
    sourceLabel: 'ICA Philadelphia · exhibition installation', license: '', provider: 'editorial-official',
    title: 'An exhibition installation at ICA Philadelphia',
  }],
  ['R7vDLuceL2A5qCQUw4IA\0Science History Institute Museum', {
    imageUrl: 'https://www.sciencehistory.org/wp-content/uploads/2023/04/visit_170804_010_dr-1-scaled.jpg',
    sourceUrl: 'https://www.sciencehistory.org/visit/hours-admission/',
    sourceLabel: 'Science History Institute · museum visit', license: '', provider: 'editorial-official',
    title: 'Science History Institute museum galleries',
  }],
  ['R7vDLuceL2A5qCQUw4IA\0Leonard Pearlstein Gallery', {
    imageUrl: 'https://drexel.edu/~/media/Images/pearlsteingallery/slideshows-banners/Facilityban3.ashx?h=800&hash=DF5C659198FA38C957A22E782087B0EFAE74BA6D&w=1800',
    sourceUrl: 'https://drexel.edu/pearlsteingallery/about/facilities/',
    sourceLabel: 'Drexel University · Pearlstein Gallery facilities', license: '', provider: 'editorial-official',
    title: 'Leonard Pearlstein Gallery exhibition space',
  }],
  ['R7vDLuceL2A5qCQUw4IA\0Anthony J. Drexel Picture Gallery', {
    imageUrl: 'https://drexel.edu/news/~/media/Drexel/Core-Site-Group/News/Images/v2/story-images/2025/March/picture-gallery/IMG_5809-edit/img_5809-edit_16x9.jpg?hash=A965B39D8A294228EB867CEB9725F26B&w=3200',
    sourceUrl: 'https://drexel.edu/news/archive/2025/March/drexel-picture-gallery-drexel-reframed-the-dragon-experience',
    sourceLabel: 'DrexelNOW · A.J. Drexel Picture Gallery', license: '', provider: 'editorial-official',
    title: 'A.J. Drexel Picture Gallery interior',
  }],
  ['R7vDLuceL2A5qCQUw4IA\0Rincliffe Gallery', {
    imageUrl: 'https://drexel.edu/~/media/Images/drexel-founding-collection/page-pics/20061362205.ashx?h=2755&w=3929&hash=A7BBBD95D6CA5CF03632C4E2A27C66E1FE57988A',
    sourceUrl: 'https://drexel.edu/drexel-founding-collection/exhibitions-events/exhibitions/Dorm%20Objects%20101/',
    sourceLabel: 'Drexel Founding Collection · Rincliffe Gallery exhibition', license: '', provider: 'editorial-official',
    title: 'Dorm Objects 101 exhibition at Rincliffe Gallery',
  }],
  ['R7vDLuceL2A5qCQUw4IA\0The Rail Park Phase One', {
    imageUrl: 'https://images.prismic.io/railpark/61e0b35a-ee02-4029-b9e1-5868516d5b70_visit-hero-day.jpg?fit=max&h=1216&w=2160',
    sourceUrl: 'https://www.therailpark.org/visit/',
    sourceLabel: 'Friends of the Rail Park · Phase One', license: '', provider: 'editorial-official',
    title: 'The Rail Park Phase One',
  }],
  ['R7vDLuceL2A5qCQUw4IA\0The Woodlands', {
    imageUrl: 'https://images.squarespace-cdn.com/content/v1/51ad165be4b095d664d87dfe/1684343789775-DHNE1GQ3QHEN50RZGZ44/328.jpg?format=1500w',
    sourceUrl: 'https://www.woodlandsphila.org/visit/',
    sourceLabel: 'The Woodlands · visitor photography', license: '', provider: 'editorial-official',
    title: 'The Woodlands grounds',
  }],
  ['R7vDLuceL2A5qCQUw4IA\0Parkway Central Library', {
    imageUrl: 'https://cdn10.phillymag.com/wp-content/uploads/sites/3/2018/02/MO-kia-libraries-opener-parkway-central-stuart-goldenberg-900x600.jpg',
    sourceUrl: 'https://www.phillymag.com/news/2018/02/17/best-libraries-philadelphia/',
    sourceLabel: 'Philadelphia Magazine · Parkway Central Library · Stuart Goldenberg', license: '', provider: 'editorial-local-media',
    title: 'Parkway Central Library reading hall',
  }],
  ['R7vDLuceL2A5qCQUw4IA\0Bartram’s Garden', {
    imageUrl: 'https://www.bartramsgarden.org/wp-content/uploads/DSC03350.jpg',
    sourceUrl: 'https://www.bartramsgarden.org/visit/',
    sourceLabel: 'Bartram’s Garden · Wright Eye Visuals', license: '', provider: 'editorial-official',
    title: 'Visitors at Bartram’s Garden',
  }],
  ['R7vDLuceL2A5qCQUw4IA\x0040th Street corridor', {
    imageUrl: 'https://www.universitycity.org/wp-content/uploads/2025/02/OUOTH2ZLXZGEZFKVMKUI52VL3Q.jpg',
    sourceUrl: 'https://www.universitycity.org/press/a-look-at-the-old-timers-on-university-citys-vibrant-40th-street-corridor/',
    sourceLabel: 'University City District · 40th Street corridor', license: '', provider: 'editorial-local-organization',
    title: 'Cliff’s Shoe Shine on South 40th Street',
  }],
]);

function clean(value, max = 2_000) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function decodeHtml(value) {
  return clean(value)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function tokens(value) {
  return clean(value, 500).toLowerCase().split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
}

const genericIdentityTokens = new Set([
  'university', 'college', 'school', 'campus', 'library', 'learning', 'study', 'student', 'students',
  'group', 'groups', 'room', 'rooms', 'space', 'spaces', 'area', 'areas', 'center', 'centre', 'commons',
  'lounge', 'floor', 'second', 'third', 'outdoor', 'patio', 'park', 'green', 'main', 'building', 'facility',
  'facilities', 'terrace', 'zone', 'hall', 'house', 'street', 'avenue', 'road', 'plaza', 'garden',
]);
const globallyAmbiguousIdentityTokens = new Set([
  'main', 'great', 'court', 'serenity', 'suite', 'president', 'toast', 'rail', 'park', 'phase', 'picture',
  'gallery', 'wawa', 'urban', 'eatery', 'race', 'walk', 'mario', 'magnificent', 'water', 'boy', 'fight',
  'song', 'welcome', 'week', 'homecoming', 'winter', 'annual', 'drag', 'show', 'outdoor', 'art',
]);

function identityTokens(value, schoolName = '') {
  const school = new Set(tokens(schoolName).filter((token) => !['university', 'college', 'school'].includes(token)));
  return tokens(value).filter((token) => !genericIdentityTokens.has(token) && !school.has(token));
}

function hasSchoolAnchor(haystack, schoolName) {
  const schoolIdentity = tokens(schoolName).filter((token) => !['university', 'college', 'school'].includes(token));
  return schoolIdentity.some((token) => haystack.includes(token));
}

function identityIsGloballyAmbiguous(entityName, schoolName = '') {
  const identity = identityTokens(entityName, schoolName);
  return identity.length === 0 || identity.every((token) => globallyAmbiguousIdentityTokens.has(token));
}

function normalizedPhrase(value) {
  return clean(value, 300).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function editorialImageOverride(atlasId, entityName) {
  const exact = editorialImageOverrides.get(`${atlasId}\0${clean(entityName, 180)}`);
  if (exact) return exact;
  const normalizedEntity = normalizedPhrase(entityName);
  for (const [key, override] of editorialImageOverrides) {
    const separator = key.indexOf('\0');
    if (separator < 0 || key.slice(0, separator) !== atlasId) continue;
    if (normalizedPhrase(key.slice(separator + 1)) === normalizedEntity) return override;
  }
  return null;
}

function distanceKm(leftLat, leftLng, rightLat, rightLng) {
  if (![leftLat, leftLng, rightLat, rightLng].every(Number.isFinite)) return null;
  const radians = (value) => value * Math.PI / 180;
  const dLat = radians(rightLat - leftLat);
  const dLng = radians(rightLng - leftLng);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(leftLat)) * Math.cos(radians(rightLat)) * Math.sin(dLng / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function safeRemoteUrl(value) {
  try {
    const url = new URL(clean(value));
    if (url.protocol !== 'https:') return '';
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || /^127\.|^10\.|^192\.168\.|^169\.254\./.test(host)) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function imageDimensions(buffer, contentType) {
  if (contentType === 'image/png' && buffer.length >= 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (contentType === 'image/jpeg' && buffer.length >= 4) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      const size = buffer.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      if (size < 2) break;
      offset += 2 + size;
    }
  }
  if (contentType === 'image/webp' && buffer.length >= 30 && buffer.toString('ascii', 0, 4) === 'RIFF') {
    const kind = buffer.toString('ascii', 12, 16);
    if (kind === 'VP8X') {
      return {
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3),
      };
    }
    if (kind === 'VP8 ' && buffer.toString('hex', 23, 26) === '9d012a') {
      return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    }
    if (kind === 'VP8L' && buffer[20] === 0x2f) {
      const bits = buffer.readUInt32LE(21);
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
    }
  }
  return null;
}

export async function fetchBitmap(value) {
  let current = safeRemoteUrl(value);
  if (!current) throw new Error('Unsupported image URL.');
  let response;
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    response = await fetch(current, {
      redirect: 'manual', signal: AbortSignal.timeout(20_000),
      headers: { accept: 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.7', 'user-agent': userAgent },
    });
    if (response.status < 300 || response.status >= 400) break;
    const location = response.headers.get('location');
    current = location ? safeRemoteUrl(new URL(location, current).toString()) : '';
    if (!current) throw new Error('Image redirected to an unsupported URL.');
  }
  if (!response?.ok) throw new Error(`Image returned ${response?.status || 0}.`);
  const contentType = clean(response.headers.get('content-type')).split(';')[0].toLowerCase();
  if (!supportedTypes.has(contentType)) throw new Error(`Unsupported image type: ${contentType || 'unknown'}.`);
  const length = Number(response.headers.get('content-length') || 0);
  if (length > 8 * 1024 * 1024) throw new Error('Image exceeds 8 MB.');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 12_000 || buffer.length > 8 * 1024 * 1024) throw new Error('Image byte size is unsuitable.');
  const dimensions = imageDimensions(buffer, contentType);
  if (!dimensions || dimensions.width < 500 || dimensions.height < 280) throw new Error('Image resolution is below 500×280.');
  const aspect = dimensions.width / dimensions.height;
  if (aspect < 0.55 || aspect > 3.2) throw new Error('Image aspect ratio is unsuitable for a card.');
  return {
    buffer, contentType, extension: supportedTypes.get(contentType), dimensions,
    fingerprint: createHash('sha256').update(buffer).digest('hex'),
  };
}

function htmlAttribute(attrs, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = attrs.match(new RegExp(`${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return decodeHtml(match?.[1] || match?.[2] || match?.[3] || '');
}

function officialInlineImageScore(entityName, cardTitle, attrs, context, imageUrl, schoolName) {
  const alt = `${htmlAttribute(attrs, 'alt')} ${htmlAttribute(attrs, 'title')}`;
  const filename = (() => { try { return decodeURIComponent(new URL(imageUrl).pathname.split('/').at(-1) || ''); } catch { return ''; } })();
  const haystack = normalizedPhrase(`${alt} ${filename} ${context}`);
  const intrinsicHaystack = normalizedPhrase(`${alt} ${filename}`);
  const entityIdentity = identityTokens(entityName, schoolName);
  const cardIdentity = identityTokens(cardTitle, schoolName);
  const schoolIdentity = tokens(schoolName).filter((token) => !['university', 'college', 'school'].includes(token));
  const matchedEntity = entityIdentity.filter((token) => haystack.includes(token)).length;
  const matchedCard = cardIdentity.filter((token) => haystack.includes(token)).length;
  const matchedSchool = schoolIdentity.filter((token) => haystack.includes(token)).length;
  const entityPhrase = normalizedPhrase(entityName);
  const cardPhrase = normalizedPhrase(cardTitle);
  const exactEntity = entityPhrase.length >= 7 && haystack.includes(entityPhrase);
  const exactCard = cardPhrase.length >= 7 && haystack.includes(cardPhrase);
  const exactIntrinsicEntity = entityPhrase.length >= 7 && intrinsicHaystack.includes(entityPhrase);
  const unsafe = /(?:logo|seal|icon|sprite|placeholder|favicon|spacer|tracking|advertisement|social media)/i.test(`${alt} ${filename}`);
  if (unsafe) return -100;
  const ambiguous = identityIsGloballyAmbiguous(entityName, schoolName);
  const identified = ambiguous
    ? exactIntrinsicEntity
    : exactEntity || exactCard || matchedEntity >= 2 || (matchedEntity >= 1 && matchedSchool >= 1) || matchedCard >= 2;
  return identified ? (exactEntity ? 100 : 0) + (exactCard ? 70 : 0) + matchedEntity * 35 + matchedCard * 15 + matchedSchool * 10 : -100;
}

async function pageImageCandidates(sourceUrl, card, target) {
  const url = safeRemoteUrl(sourceUrl);
  if (!url) return [];
  try {
    const response = await fetch(url, {
      redirect: 'follow', signal: AbortSignal.timeout(15_000),
      headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': userAgent },
    });
    if (!response.ok || !clean(response.headers.get('content-type')).includes('text/html')) return [];
    const html = (await response.text()).slice(0, 1_000_000);
    const pageIdentityText = [
      html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '',
      html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '',
      html.match(/<meta\b(?=[^>]*(?:name|property)=["'](?:description|og:title)["'])([^>]*)>/i)?.[1] || '',
      response.url,
    ].join(' ').replace(/<[^>]+>/g, ' ');
    const pageHaystack = normalizedPhrase(pageIdentityText);
    const entityPhrase = normalizedPhrase(card.entityName || card.entity_name);
    const entityIdentity = identityTokens(card.entityName || card.entity_name, target.schoolName);
    const pageMatches = entityIdentity.filter((token) => pageHaystack.includes(token)).length;
    const pageIdentifiesEntity = entityPhrase.length >= 6 && pageHaystack.includes(entityPhrase)
      || (entityIdentity.length >= 2 && pageMatches >= Math.min(2, entityIdentity.length));
    const values = [];
    const patterns = [
      /<meta\b(?=[^>]*(?:property|name)=["']og:image(?::secure_url)?["'])([^>]*)>/gi,
      /<meta\b(?=[^>]*(?:property|name)=["']twitter:image(?::src)?["'])([^>]*)>/gi,
      /<link\b(?=[^>]*rel=["']image_src["'])([^>]*)>/gi,
    ];
    for (const pattern of patterns) {
      for (const match of html.matchAll(pattern)) {
        const attrs = match[1] || '';
        const raw = attrs.match(/(?:content|href)\s*=\s*(?:"([^"]+)"|'([^']+)')/i);
        const candidate = raw?.[1] || raw?.[2] || '';
        try {
          const absolute = safeRemoteUrl(new URL(decodeHtml(candidate), response.url).toString());
          if (absolute) values.push(absolute);
        } catch { /* ignore */ }
      }
    }
    const metaCandidates = [...new Set(values)].slice(0, 5)
      .filter((imageUrl) => pageIdentifiesEntity || officialInlineImageScore(
        card.entityName || card.entity_name, card.title, '', '', imageUrl, target.schoolName,
      ) >= 30)
      .map((imageUrl) => ({
        imageUrl, sourceUrl: response.url, sourceLabel: 'Official source page', license: '', provider: 'official-page',
        title: pageIdentifiesEntity ? clean(card.entityName || card.entity_name, 180) : '',
      }));
    const inlineCandidates = [];
    for (const match of html.matchAll(/<img\b([^>]*)>/gi)) {
      const attrs = match[1] || '';
      const raw = htmlAttribute(attrs, 'src') || htmlAttribute(attrs, 'data-src') || htmlAttribute(attrs, 'data-lazy-src')
        || htmlAttribute(attrs, 'srcset').split(/[ ,]/)[0];
      if (!raw) continue;
      let absolute = '';
      try {
        absolute = new URL(decodeHtml(raw), response.url).toString();
        if (absolute.startsWith('http:')) absolute = `https:${absolute.slice(5)}`;
        absolute = safeRemoteUrl(absolute);
      } catch { /* ignore */ }
      if (!absolute) continue;
      const start = Math.max(0, (match.index || 0) - 700);
      const end = Math.min(html.length, (match.index || 0) + match[0].length + 700);
      const context = html.slice(start, end).replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
      const score = officialInlineImageScore(card.entityName || card.entity_name, card.title, attrs, context, absolute, target.schoolName);
      if (score < 30) continue;
      inlineCandidates.push({
        imageUrl: absolute, sourceUrl: response.url, sourceLabel: 'Official source page', license: '',
        provider: 'official-page', title: clean(htmlAttribute(attrs, 'alt') || card.entityName || card.entity_name, 180), score,
      });
    }
    const rankedInline = inlineCandidates.sort((left, right) => right.score - left.score).slice(0, 10);
    return [...rankedInline, ...metaCandidates]
      .filter((candidate, index, all) => all.findIndex((item) => item.imageUrl === candidate.imageUrl) === index);
  } catch {
    return [];
  }
}

function commonsScore(page, entityName, schoolName) {
  const haystack = `${clean(page.title)} ${clean(page.imageinfo?.[0]?.extmetadata?.ImageDescription?.value)}`.toLowerCase();
  const entityIdentity = identityTokens(entityName, schoolName);
  const schoolIdentity = tokens(schoolName).filter((token) => !['university', 'college', 'school'].includes(token));
  const matchedEntity = entityIdentity.filter((token) => haystack.includes(token)).length;
  const matchedSchool = schoolIdentity.filter((token) => haystack.includes(token)).length;
  const phrase = normalizedPhrase(entityName);
  const exactPhrase = phrase.length >= 7 && normalizedPhrase(haystack).includes(phrase);
  const ambiguous = identityIsGloballyAmbiguous(entityName, schoolName);
  const identified = (!ambiguous && exactPhrase) || (matchedEntity >= 1 && matchedSchool >= 1) || (!ambiguous && matchedEntity >= 2);
  if (!identified) return -100;
  return (exactPhrase ? 80 : 0) + matchedEntity * 30 + matchedSchool * 20
    - (/(?:logo|seal|coat of arms|map|diagram|icon|airliner|aircraft)/i.test(haystack) ? 150 : 0);
}

async function commonsCandidates(entityName, schoolName, townName) {
  const simplified = clean(entityName, 180)
    .replace(/\b(?:group|individual|quiet|silent|reservable|reservation|study|rooms?|spaces?|area|lounge|facility|facilities)\b/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  const queries = [...new Set([
    [entityName, schoolName, townName].filter(Boolean).join(' '),
    [simplified, schoolName].filter(Boolean).join(' '),
    entityName,
  ].map((value) => clean(value, 300)).filter(Boolean))];
  try {
    const allPages = [];
    for (const query of queries) {
      const url = new URL('https://commons.wikimedia.org/w/api.php');
      url.searchParams.set('action', 'query');
      url.searchParams.set('format', 'json');
      url.searchParams.set('formatversion', '2');
      url.searchParams.set('generator', 'search');
      url.searchParams.set('gsrsearch', query);
      url.searchParams.set('gsrnamespace', '6');
      url.searchParams.set('gsrlimit', '18');
      url.searchParams.set('prop', 'imageinfo');
      url.searchParams.set('iiprop', 'url|mime|extmetadata');
      url.searchParams.set('iiurlwidth', '1400');
      const response = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { 'user-agent': userAgent } });
      if (!response.ok) continue;
      const data = await response.json();
      allPages.push(...(data.query?.pages || []));
    }
    return [...new Map(allPages.map((page) => [page.title, page])).values()]
      .filter((page) => /^image\/(?:jpeg|png|webp)$/i.test(clean(page.imageinfo?.[0]?.mime)))
      .map((page) => ({ page, score: commonsScore(page, entityName, schoolName) }))
      .filter(({ score }) => score >= 30)
      .sort((left, right) => right.score - left.score)
      .map(({ page }) => {
        const info = page.imageinfo[0];
        const license = clean(info.extmetadata?.LicenseShortName?.value, 80).replace(/<[^>]+>/g, '');
        return {
          imageUrl: safeRemoteUrl(info.thumburl || info.url),
          sourceUrl: safeRemoteUrl(info.descriptionurl) || 'https://commons.wikimedia.org/',
          sourceLabel: `Wikimedia Commons${license ? ` · ${license}` : ''}`,
          license, provider: 'wikimedia',
          title: clean(page.title, 180).replace(/^File:/i, ''),
        };
      }).filter((candidate) => candidate.imageUrl).slice(0, 8);
  } catch {
    return [];
  }
}

function wikipediaScore(page, entityName, schoolName, townName) {
  const haystack = normalizedPhrase(`${page.title || ''} ${page.extract || ''}`);
  const phrase = normalizedPhrase(entityName);
  const entityIdentity = identityTokens(entityName, schoolName);
  const matchedEntity = entityIdentity.filter((token) => haystack.includes(token)).length;
  const schoolIdentity = tokens(schoolName).filter((token) => !['university', 'college', 'school'].includes(token));
  const townIdentity = tokens(townName);
  const matchedContext = [...schoolIdentity, ...townIdentity].filter((token) => haystack.includes(token)).length;
  const exact = phrase.length >= 6 && haystack.includes(phrase);
  const ambiguous = identityIsGloballyAmbiguous(entityName, schoolName);
  const internalSpace = /\b(?:lounge|room|desk|studio|center|centre|hall|library|commons|lab|gallery|office|building|theater|theatre|chapel|gym|field|arena)\b/i.test(entityName);
  const identified = (!ambiguous && exact)
    || (!internalSpace && matchedEntity >= 2)
    || (!internalSpace && matchedEntity >= 1 && matchedContext >= 1);
  if (!identified) return -100;
  const imageUrl = clean(page.original?.source || page.thumbnail?.source);
  const unsafe = /(?:logo|seal|coat.of.arms|icon|map|diagram|wordmark|flag)/i.test(`${page.title || ''} ${imageUrl}`);
  return unsafe ? -100 : (exact ? 80 : 0) + matchedEntity * 25 + matchedContext * 15;
}

async function wikipediaCandidates(entityName, schoolName, townName) {
  const simplified = clean(entityName, 180)
    .replace(/\b(?:group|individual|quiet|silent|reservable|reservation|study|rooms?|spaces?|area|lounge|facility|facilities)\b/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  const queries = [...new Set([
    [entityName, townName].filter(Boolean).join(' '),
    [entityName, schoolName].filter(Boolean).join(' '),
    [simplified, townName].filter(Boolean).join(' '),
    entityName,
  ].map((value) => clean(value, 300)).filter(Boolean))];
  try {
    const candidates = [];
    for (const query of queries) {
      const searchUrl = new URL('https://en.wikipedia.org/w/api.php');
      searchUrl.searchParams.set('action', 'query');
      searchUrl.searchParams.set('format', 'json');
      searchUrl.searchParams.set('formatversion', '2');
      searchUrl.searchParams.set('generator', 'search');
      searchUrl.searchParams.set('gsrsearch', query);
      searchUrl.searchParams.set('gsrnamespace', '0');
      searchUrl.searchParams.set('gsrlimit', '8');
      searchUrl.searchParams.set('prop', 'pageimages|info|extracts');
      searchUrl.searchParams.set('piprop', 'thumbnail|original|name');
      searchUrl.searchParams.set('pithumbsize', '1600');
      searchUrl.searchParams.set('inprop', 'url');
      searchUrl.searchParams.set('exintro', '1');
      searchUrl.searchParams.set('explaintext', '1');
      searchUrl.searchParams.set('exchars', '700');
      const response = await fetch(searchUrl, { signal: AbortSignal.timeout(15_000), headers: { 'user-agent': userAgent } });
      if (!response.ok) continue;
      const data = await response.json();
      for (const page of data.query?.pages || []) {
        const imageUrl = safeRemoteUrl(page.original?.source || page.thumbnail?.source);
        const sourceUrl = safeRemoteUrl(page.fullurl);
        const score = wikipediaScore(page, entityName, schoolName, townName);
        if (!imageUrl || !sourceUrl || score < 30) continue;
        candidates.push({ imageUrl, sourceUrl, sourceLabel: 'Wikipedia · Wikimedia image', license: '',
          provider: 'wikipedia', title: clean(page.title, 180), score });
      }
    }
    return [...new Map(candidates.sort((left, right) => right.score - left.score)
      .map((candidate) => [candidate.imageUrl, candidate])).values()].slice(0, 8);
  } catch {
    return [];
  }
}

const wikidataCandidateCache = new Map();
const wikimediaGeoCandidateCache = new Map();

function wikidataLabelMatches(entityName, label, schoolName) {
  const entity = normalizedPhrase(entityName).replace(/^the /, '');
  const candidate = normalizedPhrase(label).replace(/^the /, '');
  if (!entity || !candidate) return false;
  if (entity === candidate) return true;
  const school = new Set(tokens(schoolName).filter((token) => !['university', 'college', 'school'].includes(token)));
  const withoutSchool = (value) => value.split(' ')
    .filter((token) => !school.has(token) && !['university', 'college', 'school'].includes(token))
    .join(' ').trim();
  const entityWithoutSchool = withoutSchool(entity);
  const candidateWithoutSchool = withoutSchool(candidate);
  return entityWithoutSchool.length >= 4 && entityWithoutSchool === candidateWithoutSchool
    && (hasSchoolAnchor(entity, schoolName) || hasSchoolAnchor(candidate, schoolName));
}

function wikidataSearchNameMatches(entityName, item, schoolName) {
  return wikidataLabelMatches(entityName, item?.label, schoolName)
    || wikidataLabelMatches(entityName, item?.match?.text, schoolName)
    || (item?.aliases || []).some((alias) => wikidataLabelMatches(entityName, alias, schoolName));
}

function wikidataCoordinate(entity) {
  const value = entity?.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
  const latitude = Number(value?.latitude);
  const longitude = Number(value?.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

async function wikidataCandidates(card, target) {
  const entityName = clean(card.entityName || card.entity_name, 180);
  const latitude = Number(card.locationLat ?? card.latitude);
  const longitude = Number(card.locationLng ?? card.longitude);
  const cacheKey = [entityName, target.schoolName, target.townName,
    Number.isFinite(latitude) ? latitude.toFixed(4) : '', Number.isFinite(longitude) ? longitude.toFixed(4) : ''].join('\0');
  if (wikidataCandidateCache.has(cacheKey)) return wikidataCandidateCache.get(cacheKey);
  const pending = (async () => {
    if (!entityName || identityIsGloballyAmbiguous(entityName, target.schoolName)) return [];
    try {
      const searchUrl = new URL('https://www.wikidata.org/w/api.php');
      searchUrl.searchParams.set('action', 'wbsearchentities');
      searchUrl.searchParams.set('format', 'json');
      searchUrl.searchParams.set('language', 'en');
      searchUrl.searchParams.set('uselang', 'en');
      searchUrl.searchParams.set('type', 'item');
      searchUrl.searchParams.set('limit', '10');
      searchUrl.searchParams.set('search', [entityName, target.townName].filter(Boolean).join(' '));
      let response = await fetch(searchUrl, { signal: AbortSignal.timeout(15_000), headers: { 'user-agent': userAgent } });
      if (!response.ok) return [];
      let data = await response.json();
      let matches = (data.search || []).filter((item) => wikidataSearchNameMatches(entityName, item, target.schoolName));
      if (!matches.length) {
        searchUrl.searchParams.set('search', entityName);
        response = await fetch(searchUrl, { signal: AbortSignal.timeout(15_000), headers: { 'user-agent': userAgent } });
        if (!response.ok) return [];
        data = await response.json();
        matches = (data.search || []).filter((item) => wikidataSearchNameMatches(entityName, item, target.schoolName));
      }
      const ids = matches.map((item) => clean(item.id, 30)).filter(Boolean).slice(0, 8);
      if (!ids.length) return [];
      const entityUrl = new URL('https://www.wikidata.org/w/api.php');
      entityUrl.searchParams.set('action', 'wbgetentities');
      entityUrl.searchParams.set('format', 'json');
      entityUrl.searchParams.set('languages', 'en');
      entityUrl.searchParams.set('props', 'claims|labels|descriptions');
      entityUrl.searchParams.set('ids', ids.join('|'));
      response = await fetch(entityUrl, { signal: AbortSignal.timeout(15_000), headers: { 'user-agent': userAgent } });
      if (!response.ok) return [];
      data = await response.json();
      const plausible = Object.values(data.entities || {}).map((entity) => {
        const label = clean(entity?.labels?.en?.value, 180);
        if (!ids.includes(clean(entity?.id, 30))) return null;
        const coordinate = wikidataCoordinate(entity);
        const distance = coordinate && Number.isFinite(latitude) && Number.isFinite(longitude)
          ? distanceKm(latitude, longitude, coordinate.latitude, coordinate.longitude) : null;
        const description = normalizedPhrase(entity?.descriptions?.en?.value || '');
        const contextTokens = [...tokens(target.townName), ...tokens(target.state),
          ...tokens(target.schoolName).filter((token) => !['university', 'college', 'school'].includes(token))];
        const contextMatched = contextTokens.some((token) => description.includes(token));
        if (!(distance !== null && distance <= 2.5) && !contextMatched) return null;
        const images = (entity?.claims?.P18 || []).map((claim) => clean(claim?.mainsnak?.datavalue?.value, 300)).filter(Boolean);
        if (!images.length) return null;
        return { entity, label, distance, images };
      }).filter(Boolean).sort((left, right) => (left.distance ?? 99) - (right.distance ?? 99));
      if (!plausible.length) return [];
      const selected = plausible[0];
      const files = selected.images.slice(0, 3);
      const commonsUrl = new URL('https://commons.wikimedia.org/w/api.php');
      commonsUrl.searchParams.set('action', 'query');
      commonsUrl.searchParams.set('format', 'json');
      commonsUrl.searchParams.set('formatversion', '2');
      commonsUrl.searchParams.set('prop', 'imageinfo');
      commonsUrl.searchParams.set('iiprop', 'url|mime|extmetadata');
      commonsUrl.searchParams.set('iiurlwidth', '1600');
      commonsUrl.searchParams.set('titles', files.map((file) => `File:${file}`).join('|'));
      response = await fetch(commonsUrl, { signal: AbortSignal.timeout(15_000), headers: { 'user-agent': userAgent } });
      if (!response.ok) return [];
      data = await response.json();
      return (data.query?.pages || []).filter((page) => {
        const info = page.imageinfo?.[0];
        return info && /^image\/(?:jpeg|png|webp)$/i.test(clean(info.mime))
          && !/(?:logo|seal|coat of arms|wordmark|flag|map|diagram|icon)/i.test(clean(page.title));
      }).map((page) => {
        const info = page.imageinfo[0];
        const license = clean(info.extmetadata?.LicenseShortName?.value, 80).replace(/<[^>]+>/g, '');
        return {
          imageUrl: safeRemoteUrl(info.thumburl || info.url),
          sourceUrl: `https://www.wikidata.org/wiki/${encodeURIComponent(selected.entity.id)}`,
          sourceLabel: `Wikidata exact entity · Wikimedia Commons${license ? ` · ${license}` : ''}`,
          license, provider: 'wikidata-wikimedia',
          title: `${entityName} · ${selected.label} · ${clean(page.title, 180).replace(/^File:/i, '')}`,
        };
      }).filter((candidate) => candidate.imageUrl);
    } catch {
      return [];
    }
  })();
  wikidataCandidateCache.set(cacheKey, pending);
  return pending;
}

async function wikimediaGeoCandidates(card, target) {
  const entityName = clean(card.entityName || card.entity_name, 180);
  const latitude = Number(card.locationLat ?? card.latitude);
  const longitude = Number(card.locationLng ?? card.longitude);
  if (!entityName || !Number.isFinite(latitude) || !Number.isFinite(longitude)
    || identityIsGloballyAmbiguous(entityName, target.schoolName)) return [];
  const cacheKey = `${latitude.toFixed(5)}\0${longitude.toFixed(5)}\0${normalizedPhrase(entityName)}`;
  if (wikimediaGeoCandidateCache.has(cacheKey)) return wikimediaGeoCandidateCache.get(cacheKey);
  const pending = (async () => {
    try {
      const url = new URL('https://commons.wikimedia.org/w/api.php');
      url.searchParams.set('action', 'query');
      url.searchParams.set('format', 'json');
      url.searchParams.set('formatversion', '2');
      url.searchParams.set('generator', 'geosearch');
      url.searchParams.set('ggsprimary', 'all');
      url.searchParams.set('ggsnamespace', '6');
      url.searchParams.set('ggslimit', '50');
      url.searchParams.set('ggsradius', '220');
      url.searchParams.set('ggscoord', `${latitude}|${longitude}`);
      url.searchParams.set('prop', 'imageinfo|coordinates');
      url.searchParams.set('iiprop', 'url|mime|extmetadata');
      url.searchParams.set('iiurlwidth', '1600');
      const response = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { 'user-agent': userAgent } });
      if (!response.ok) return [];
      const data = await response.json();
      const phrase = normalizedPhrase(entityName);
      const identity = identityTokens(entityName, target.schoolName);
      if (!identity.length) return [];
      return (data.query?.pages || []).map((page) => {
        const info = page.imageinfo?.[0];
        if (!info || !/^image\/(?:jpeg|png|webp)$/i.test(clean(info.mime))) return null;
        const metadata = info.extmetadata || {};
        const haystack = normalizedPhrase([
          page.title, metadata.ObjectName?.value, metadata.ImageDescription?.value, metadata.Categories?.value,
        ].map((value) => clean(value).replace(/<[^>]+>/g, ' ')).join(' '));
        const exact = phrase.length >= 7 && haystack.includes(phrase);
        const matched = identity.filter((token) => haystack.includes(token)).length;
        const schoolAnchored = hasSchoolAnchor(haystack, target.schoolName);
        const identified = exact || (identity.length >= 2 && matched === identity.length && schoolAnchored);
        if (!identified || /(?:logo|seal|coat of arms|wordmark|flag|map|diagram|icon|satellite|umbra)/i.test(haystack)) return null;
        const coordinate = page.coordinates?.[0];
        const distance = coordinate ? distanceKm(latitude, longitude, Number(coordinate.lat), Number(coordinate.lon)) : null;
        if (distance === null || distance > 0.22) return null;
        const license = clean(metadata.LicenseShortName?.value, 80).replace(/<[^>]+>/g, '');
        return {
          imageUrl: safeRemoteUrl(info.thumburl || info.url), sourceUrl: safeRemoteUrl(info.descriptionurl),
          sourceLabel: `Wikimedia Commons nearby exact match${license ? ` · ${license}` : ''}`,
          license, provider: 'wikimedia-geosearch',
          title: `${entityName} · ${clean(page.title, 180).replace(/^File:/i, '')}`,
          score: (exact ? 100 : 0) + matched * 25 - distance * 10,
        };
      }).filter(Boolean).sort((left, right) => right.score - left.score).slice(0, 5);
    } catch {
      return [];
    }
  })();
  wikimediaGeoCandidateCache.set(cacheKey, pending);
  return pending;
}

async function googlePlaceCandidates(card, target, apiKey, functionsBaseUrl) {
  if (!apiKey || !['place', 'study_space', 'street_or_district', 'sequence_stop'].includes(clean(card.subjectType || card.subject_type))) return [];
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
    url.searchParams.set('query', [card.entityName || card.entity_name, target.schoolName, target.townName, target.state].filter(Boolean).join(' '));
    url.searchParams.set('key', apiKey);
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { 'user-agent': userAgent } });
    const data = await response.json();
    const entityName = clean(card.entityName || card.entity_name, 180);
    const entityIdentity = identityTokens(entityName, target.schoolName);
    const phrase = normalizedPhrase(entityName);
    return (data.results || []).map((place, index) => {
      const haystack = normalizedPhrase(`${place.name || ''} ${place.formatted_address || ''}`);
      const matched = entityIdentity.filter((token) => haystack.includes(token)).length;
      const exact = phrase.length >= 7 && haystack.includes(phrase);
      const distance = distanceKm(
        Number(target.latitude), Number(target.longitude),
        Number(place.geometry?.location?.lat), Number(place.geometry?.location?.lng),
      );
      const geographicallyPlausible = distance !== null && distance <= 2.2;
      const ambiguous = identityIsGloballyAmbiguous(entityName, target.schoolName);
      const identified = (!ambiguous && exact) || (!ambiguous && matched >= 2) || (matched >= 1 && geographicallyPlausible);
      return { place, score: identified ? (exact ? 100 : matched * 30 + (geographicallyPlausible ? 15 : 0)) - index : -100 };
    }).filter(({ score }) => score >= 29).sort((left, right) => right.score - left.score).slice(0, 2).flatMap(({ place }) => (place.photos || []).slice(0, 2).map((photo) => ({
      imageUrl: `${functionsBaseUrl}/boardPlacePhoto?ref=${encodeURIComponent(photo.photo_reference)}`,
      sourceUrl: place.place_id ? `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(place.place_id)}` : '',
      sourceLabel: 'Google Places photo', license: '', provider: 'google-places', title: clean(place.name, 180),
    })));
  } catch {
    return [];
  }
}

async function googleImageCandidates(card, target, apiKey, cx) {
  if (!apiKey || !cx) return [];
  try {
    const entityName = clean(card.entityName || card.entity_name, 180);
    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('cx', cx);
    url.searchParams.set('q', [entityName, target.schoolName, target.townName].filter(Boolean).join(' '));
    url.searchParams.set('searchType', 'image');
    url.searchParams.set('safe', 'active');
    url.searchParams.set('imgType', 'photo');
    url.searchParams.set('num', '8');
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { 'user-agent': userAgent } });
    if (!response.ok) return [];
    const data = await response.json();
    const entityIdentity = identityTokens(entityName, target.schoolName);
    const schoolIdentity = tokens(target.schoolName).filter((token) => !['university', 'college', 'school'].includes(token));
    const phrase = normalizedPhrase(entityName);
    return (data.items || []).map((item, index) => {
      const haystack = [item.title, item.snippet, item.displayLink, item.image?.contextLink, item.link].map(clean).join(' ').toLowerCase();
      const normalized = normalizedPhrase(haystack);
      const matchedEntity = entityIdentity.filter((token) => haystack.includes(token)).length;
      const matchedSchool = schoolIdentity.filter((token) => haystack.includes(token)).length;
      const exact = phrase.length >= 7 && normalized.includes(phrase);
      const unsafe = /(?:logo|seal|icon|map|diagram|sprite|placeholder|favicon|stock photo)/i.test(haystack);
      const ambiguous = identityIsGloballyAmbiguous(entityName, target.schoolName);
      const identified = (!ambiguous && exact) || (matchedEntity >= 1 && matchedSchool >= 1) || (!ambiguous && matchedEntity >= 2);
      return { item, score: unsafe || !identified ? -100 : (exact ? 80 : 0) + matchedEntity * 30 + matchedSchool * 20 - index };
    }).filter(({ score }) => score >= 30).sort((left, right) => right.score - left.score).map(({ item }) => ({
      imageUrl: safeRemoteUrl(item.link || item.image?.thumbnailLink),
      sourceUrl: safeRemoteUrl(item.image?.contextLink),
      sourceLabel: clean(item.displayLink, 120) ? `Web image · ${clean(item.displayLink, 120)}` : 'Verified web image',
      license: '', provider: 'verified-web', title: clean(item.title, 180),
    })).filter((candidate) => candidate.imageUrl && candidate.sourceUrl).slice(0, 6);
  } catch {
    return [];
  }
}

export async function uploadBitmap(admin, bitmap, storagePath, provenance, bucketName) {
  const bucket = admin.storage().bucket(bucketName);
  const token = randomUUID();
  await bucket.file(storagePath).save(bitmap.buffer, {
    resumable: false,
    metadata: {
      contentType: bitmap.contentType,
      cacheControl: 'public,max-age=31536000,immutable',
      metadata: {
        firebaseStorageDownloadTokens: token,
        livingWikiImageSource: provenance.provider,
        livingWikiImageSourceUrl: provenance.sourceUrl,
        livingWikiImageLicense: provenance.license || '',
        livingWikiImageFingerprint: bitmap.fingerprint,
      },
    },
  });
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(token)}`;
}

function schoolSearchVariants(schoolName) {
  const value = clean(schoolName, 180);
  return [...new Set([
    value,
    value.replace(/^CUNY\s+/i, '').replace(/\s+Campus Immersion$/i, '').trim(),
    value.replace(/\s+in the City of New York$/i, '').trim(),
    value.replace(/^The\s+/i, '').trim(),
  ].filter((item) => item.length >= 4))];
}

function campusCandidateFromPage(page, target, mode) {
  const info = page.imageinfo?.[0];
  if (!info || !/^image\/(?:jpeg|png|webp)$/i.test(clean(info.mime))) return null;
  const metadata = info.extmetadata || {};
  const title = clean(page.title, 300).replace(/^File:/i, '');
  const metadataText = [title, metadata.ObjectName?.value, metadata.ImageDescription?.value, metadata.Categories?.value]
    .map((value) => clean(value, 2_000).replace(/<[^>]+>/g, ' ')).join(' ');
  const haystack = normalizedPhrase(metadataText);
  if (/(?:logo|seal|coat of arms|wordmark|flag|map|diagram|icon|aircraft|airliner|satellite|umbra|basketball player|football player)/i.test(haystack)) return null;
  const schoolPhrase = normalizedPhrase(target.schoolName);
  const variants = schoolSearchVariants(target.schoolName).map(normalizedPhrase);
  const schoolIdentity = tokens(target.schoolName).filter((token) => !['university', 'college', 'school', 'campus', 'immersion'].includes(token));
  const matchedSchool = schoolIdentity.filter((token) => haystack.includes(token)).length;
  const exactSchool = variants.some((variant) => variant.length >= 5 && haystack.includes(variant));
  const coordinate = page.coordinates?.[0];
  const distance = coordinate ? distanceKm(
    Number(target.latitude), Number(target.longitude), Number(coordinate.lat), Number(coordinate.lon),
  ) : null;
  const locationVerified = distance !== null && distance <= 2.5;
  if (mode === 'search' && !exactSchool && matchedSchool < Math.min(2, schoolIdentity.length)) return null;
  if (mode === 'geo' && !locationVerified) return null;
  const license = clean(metadata.LicenseShortName?.value, 80).replace(/<[^>]+>/g, '');
  const imageUrl = safeRemoteUrl(info.thumburl || info.url);
  const sourceUrl = safeRemoteUrl(info.descriptionurl);
  if (!imageUrl || !sourceUrl) return null;
  return {
    imageUrl, sourceUrl, sourceLabel: `Wikimedia Commons · related campus/location photo${license ? ` · ${license}` : ''}`,
    license, provider: 'campus-fallback-wikimedia', title,
    score: (exactSchool ? 200 : 0) + matchedSchool * 35 + (locationVerified ? Math.max(0, 80 - (distance * 25)) : 0),
  };
}

export async function universityCampusFallbackCandidates(target) {
  const pages = [];
  for (const query of schoolSearchVariants(target.schoolName)) {
    try {
      const url = new URL('https://commons.wikimedia.org/w/api.php');
      url.searchParams.set('action', 'query');
      url.searchParams.set('format', 'json');
      url.searchParams.set('formatversion', '2');
      url.searchParams.set('generator', 'search');
      url.searchParams.set('gsrsearch', `\"${query}\"`);
      url.searchParams.set('gsrnamespace', '6');
      url.searchParams.set('gsrlimit', '100');
      url.searchParams.set('prop', 'imageinfo|coordinates');
      url.searchParams.set('iiprop', 'url|mime|extmetadata');
      url.searchParams.set('iiurlwidth', '1600');
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { 'user-agent': userAgent } });
      if (!response.ok) continue;
      const data = await response.json();
      pages.push(...(data.query?.pages || []).map((page) => ({ page, mode: 'search' })));
    } catch { /* keep the remaining free sources */ }
  }
  if (Number.isFinite(Number(target.latitude)) && Number.isFinite(Number(target.longitude))) {
    try {
      const url = new URL('https://commons.wikimedia.org/w/api.php');
      url.searchParams.set('action', 'query');
      url.searchParams.set('format', 'json');
      url.searchParams.set('formatversion', '2');
      url.searchParams.set('generator', 'geosearch');
      url.searchParams.set('ggsprimary', 'all');
      url.searchParams.set('ggsnamespace', '6');
      url.searchParams.set('ggslimit', '100');
      url.searchParams.set('ggsradius', '2500');
      url.searchParams.set('ggscoord', `${target.latitude}|${target.longitude}`);
      url.searchParams.set('prop', 'imageinfo|coordinates');
      url.searchParams.set('iiprop', 'url|mime|extmetadata');
      url.searchParams.set('iiurlwidth', '1600');
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { 'user-agent': userAgent } });
      if (response.ok) {
        const data = await response.json();
        pages.push(...(data.query?.pages || []).map((page) => ({ page, mode: 'geo' })));
      }
    } catch { /* search results may still be sufficient */ }
  }
  return [...new Map(pages.map(({ page, mode }) => [`${page.pageid || page.title}`, { page, mode }])).values()]
    .map(({ page, mode }) => campusCandidateFromPage(page, target, mode)).filter(Boolean)
    .sort((left, right) => right.score - left.score)
    .filter((candidate, index, all) => all.findIndex((item) => item.imageUrl === candidate.imageUrl) === index);
}

function pageAssetUrls(html, responseUrl) {
  const values = [];
  for (const match of html.matchAll(/<(?:meta|link)\b([^>]*)>/gi)) {
    const attrs = match[1] || '';
    if (!/(?:og:image|twitter:image|image_src)/i.test(attrs)) continue;
    values.push(htmlAttribute(attrs, 'content') || htmlAttribute(attrs, 'href'));
  }
  for (const match of html.matchAll(/<(?:img|source)\b([^>]*)>/gi)) {
    const attrs = match[1] || '';
    const srcset = htmlAttribute(attrs, 'srcset') || htmlAttribute(attrs, 'data-srcset');
    const largestSrcset = srcset.split(',').map((item) => item.trim().split(/\s+/)[0]).filter(Boolean).at(-1);
    values.push(largestSrcset || htmlAttribute(attrs, 'src') || htmlAttribute(attrs, 'data-src') || htmlAttribute(attrs, 'data-lazy-src'));
  }
  for (const match of html.matchAll(/background-image\s*:\s*url\((['"]?)([^)'";]+)\1\)/gi)) values.push(match[2]);
  return [...new Set(values.map((value) => {
    try {
      let absolute = new URL(decodeHtml(value), responseUrl).toString();
      if (absolute.startsWith('http:')) absolute = `https:${absolute.slice(5)}`;
      return safeRemoteUrl(absolute);
    } catch { return ''; }
  }).filter((value) => value && !/(?:logo|seal|wordmark|favicon|icon|sprite|placeholder|avatar|tracking|pixel|spacer|badge|button)/i.test(value)))];
}

export async function relatedPageImageCandidates(sourceUrl, sourceLabel = 'Related source page') {
  const url = safeRemoteUrl(sourceUrl);
  if (!url) return [];
  try {
    const response = await fetch(url, {
      redirect: 'follow', signal: AbortSignal.timeout(18_000),
      headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': userAgent },
    });
    if (!response.ok || !clean(response.headers.get('content-type')).includes('text/html')) return [];
    const html = (await response.text()).slice(0, 1_500_000);
    const pageTitle = decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')
      .replace(/<[^>]+>/g, ' ').trim();
    return pageAssetUrls(html, response.url).slice(0, 40).map((imageUrl) => ({
      imageUrl, sourceUrl: response.url, sourceLabel, license: '', provider: 'related-source-page',
      title: pageTitle || sourceLabel,
    }));
  } catch {
    return [];
  }
}

export async function officialUniversitySiteCandidates(target, website, seedUrls = []) {
  const root = safeRemoteUrl(website);
  if (!root) return [];
  const rootUrl = new URL(root);
  const sameOfficialSite = (value) => {
    try {
      const host = new URL(value).hostname.toLowerCase();
      const official = rootUrl.hostname.toLowerCase();
      return host === official || host.endsWith(`.${official}`) || official.endsWith(`.${host}`);
    } catch { return false; }
  };
  const queue = [...new Set([root, ...seedUrls.filter(sameOfficialSite)])].slice(0, 30);
  const visited = new Set();
  const candidates = [];
  while (queue.length && visited.size < 18 && candidates.length < 80) {
    const url = queue.shift();
    if (!url || visited.has(url)) continue;
    visited.add(url);
    try {
      const response = await fetch(url, {
        redirect: 'follow', signal: AbortSignal.timeout(18_000),
        headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': userAgent },
      });
      if (!response.ok || !clean(response.headers.get('content-type')).includes('text/html')) continue;
      const html = (await response.text()).slice(0, 1_500_000);
      const pageTitle = decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')
        .replace(/<[^>]+>/g, ' ').trim();
      for (const imageUrl of pageAssetUrls(html, response.url)) candidates.push({
        imageUrl, sourceUrl: response.url, sourceLabel: `${target.schoolName} official website`, license: '',
        provider: 'official-campus-fallback', title: pageTitle || target.schoolName,
      });
      if (visited.size <= 5) {
        for (const match of html.matchAll(/<a\b([^>]*)>/gi)) {
          const href = htmlAttribute(match[1] || '', 'href');
          if (!href) continue;
          try {
            const absolute = new URL(href, response.url).toString();
            if (sameOfficialSite(absolute) && /(?:campus|visit|tour|life|student|about|admission|gallery|news)/i.test(absolute)
              && !visited.has(absolute) && queue.length < 40) queue.push(absolute);
          } catch { /* ignore malformed links */ }
        }
      }
    } catch { /* continue through official pages */ }
  }
  return [...new Map(candidates.map((candidate) => [candidate.imageUrl, candidate])).values()];
}

export async function enrichUniversityBoardImages(payload, target, options) {
  const candidateLists = await Promise.all(payload.cards.map(async (card) => {
    if (clean(card.imageUrl) && clean(card.imageSourceUrl) && clean(card.imageFingerprint)) return [];
    const override = editorialImageOverride(target.atlasId, card.entityName || card.entity_name);
    const [placeCandidates, pageCandidates, wikidata, wikimediaGeo, commons, wikipedia, webCandidates] = await Promise.all([
      options.freeOnly ? [] : googlePlaceCandidates(card, target, options.googlePlacesApiKey, options.functionsBaseUrl),
      options.wikidataOnly ? [] : pageImageCandidates(card.sourceUrl, card, target),
      options.freeOnly ? wikidataCandidates(card, target) : [],
      options.freeOnly && options.wikimediaGeo ? wikimediaGeoCandidates(card, target) : [],
      options.freeOnly ? [] : commonsCandidates(card.entityName, target.schoolName, target.townName),
      options.freeOnly ? [] : wikipediaCandidates(card.entityName, target.schoolName, target.townName),
      options.freeOnly ? [] : googleImageCandidates(card, target, options.googleCustomSearchApiKey, options.googleCustomSearchCx),
    ]);
    const preferPlacePhoto = clean(card.subjectType || card.subject_type) === 'place'
      && /\b\d{2,}\b/.test(clean(card.entityName || card.entity_name));
    return [
      ...(override ? [override] : []),
      ...(preferPlacePhoto ? placeCandidates : []),
      ...wikidata,
      ...wikimediaGeo,
      ...pageCandidates,
      ...(!preferPlacePhoto ? placeCandidates : []),
      ...commons,
      ...wikipedia,
      ...webCandidates,
    ];
  }));
  async function firstUsable(candidates, forbidden = new Set()) {
    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
      const candidate = candidates[candidateIndex];
      if (!candidate.imageUrl || /(?:logo|favicon|sprite|placeholder|default-avatar)/i.test(candidate.imageUrl)) continue;
      try {
        const bitmap = await fetchBitmap(candidate.imageUrl);
        if (forbidden.has(bitmap.fingerprint)) continue;
        return { candidate, bitmap, candidateIndex };
      } catch { /* try the next defensible image */ }
    }
    return null;
  }
  const usedFingerprints = new Set(payload.cards.map((card) => clean(card.imageFingerprint)).filter(Boolean));
  const firstPass = await Promise.all(candidateLists.map((candidates) => firstUsable(candidates, usedFingerprints)));
  const selectedCards = [];
  const failures = [];
  for (let index = 0; index < payload.cards.length; index += 1) {
    const card = payload.cards[index];
    if (clean(card.imageUrl) && clean(card.imageSourceUrl) && clean(card.imageFingerprint)) continue;
    let selected = firstPass[index];
    if (selected && usedFingerprints.has(selected.bitmap.fingerprint)) {
      selected = await firstUsable(candidateLists[index].slice(selected.candidateIndex + 1), usedFingerprints);
    }
    if (!selected) failures.push(`${index + 1}. ${card.entityName || card.title}`);
    else {
      usedFingerprints.add(selected.bitmap.fingerprint);
      selectedCards.push({ card, index, ...selected });
    }
  }
  if (failures.length && !options.allowPartial) return { ok: false, failures, cards: [] };
  const resolved = await Promise.all(selectedCards.map(async (selected) => {
    const storagePath = `university-board-images/${target.atlasId}/${payload.template_id}/${String(selected.index + 1).padStart(2, '0')}-${selected.bitmap.fingerprint.slice(0, 16)}.${selected.bitmap.extension}`;
    const imageUrl = await uploadBitmap(options.admin, selected.bitmap, storagePath, selected.candidate, options.bucketName);
    return {
      ...selected.card,
      imageUrl, imageUrls: [imageUrl], imageSource: selected.candidate.provider,
      imageSourceUrl: selected.candidate.sourceUrl, imageSourceLabel: selected.candidate.sourceLabel,
      imageLicense: selected.candidate.license, imageTitle: selected.candidate.title,
      imageFingerprint: selected.bitmap.fingerprint,
      imageWidth: selected.bitmap.dimensions.width, imageHeight: selected.bitmap.dimensions.height,
      imageVerificationStatus: 'verified', imageResolvedAt: new Date().toISOString(),
    };
  }));
  const resolvedByIndex = new Map(selectedCards.map((selected, index) => [selected.index, resolved[index]]));
  const mergedCards = payload.cards.map((card, index) => resolvedByIndex.get(index) || card);
  const imageCards = mergedCards.filter((card) => clean(card.imageUrl) && clean(card.imageSourceUrl) && clean(card.imageFingerprint));
  const allFingerprints = new Set(imageCards.map((card) => clean(card.imageFingerprint)).filter(Boolean));
  return {
    ok: failures.length === 0 || (options.allowPartial && resolved.length > 0),
    complete: failures.length === 0,
    failures,
    cards: resolved,
    board: {
      ...payload,
      cards: mergedCards,
      imageUrl: imageCards[0]?.imageUrl || payload.imageUrl || '',
      validation_summary: {
        ...payload.validation_summary,
        image_count: imageCards.length,
        unique_image_count: allFingerprints.size,
        all_have_images: failures.length === 0 && imageCards.length === payload.cards.length
          && allFingerprints.size === payload.cards.length,
        image_validation_mode: options.freeOnly
          ? 'free_exact_official_and_wikidata_wikimedia_downloaded_bitmap_with_provenance'
          : 'downloaded_bitmap_with_provenance',
      },
    },
  };
}
