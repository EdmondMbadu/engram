import { generateQrSvgDataUrl } from '../qr-code';

export const BOARD_PROMO_IMAGE_WIDTH = 2400;
export const BOARD_PROMO_IMAGE_HEIGHT = 1260;

export type BoardPromoImageSpec = {
  title: string;
  description: string;
  ownerName: string;
  updatedLabel: string;
  cardCount: number;
  coverImageUrl: string;
  boardUrl: string;
  boardTypeLabel?: string;
  icon?: string;
  showQrCode: boolean;
  showDescription: boolean;
};

type PromoLoadedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
};

export function boardPromoFileName(boardUrl: string, title: string): string {
  let candidate = '';
  try {
    const segments = new URL(boardUrl, 'https://livingwiki.com').pathname.split('/').filter(Boolean);
    const boardSegment = segments.lastIndexOf('boards');
    candidate = boardSegment >= 0 ? segments[boardSegment + 1] ?? '' : '';
  } catch {
    candidate = '';
  }
  const slug = (candidate || title)
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'livingwiki-board';
  return `${slug}-promo.png`;
}

export function boardPromoDisplayUrl(boardUrl: string): string {
  try {
    const parsed = new URL(boardUrl, 'https://livingwiki.com');
    const host = parsed.host.replace(/^www\./i, '');
    const path = parsed.pathname.replace(/\/$/, '') || '/';
    return `${host}${path}`;
  } catch {
    return boardUrl.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  }
}

export function boardPromoTitleFontSize(title: string): number {
  const length = title.trim().length;
  if (length > 84) return 88;
  if (length > 62) return 98;
  if (length > 42) return 112;
  return 126;
}

export function boardPromoTextLines(
  text: string,
  maxWidth: number,
  measure: (value: string) => number,
  maxLines: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length || maxLines <= 0 || maxWidth <= 0) return [];
  const lines: string[] = [];
  let current = '';
  let consumedWords = 0;

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || measure(candidate) <= maxWidth) {
      current = candidate;
      consumedWords += 1;
      continue;
    }
    lines.push(current);
    if (lines.length === maxLines) break;
    current = truncateMeasuredText(word, maxWidth, measure);
    consumedWords += 1;
  }

  if (lines.length < maxLines && current) lines.push(current);
  const truncated = consumedWords < words.length
    || lines.join(' ').replace(/…/g, '').length < words.join(' ').length;
  if (truncated && lines.length) {
    lines[lines.length - 1] = truncateMeasuredText(`${lines[lines.length - 1].replace(/…+$/, '')}…`, maxWidth, measure);
  }
  return lines.slice(0, maxLines);
}

export async function renderBoardPromoImage(spec: BoardPromoImageSpec): Promise<Blob> {
  if (typeof document === 'undefined') throw new Error('Promo images can only be created in a browser.');
  const title = spec.title.trim() || 'LivingWiki board';
  const boardUrl = spec.boardUrl.trim();
  if (!boardUrl) throw new Error('This board does not have a shareable URL.');

  await document.fonts?.ready.catch(() => undefined);
  const canvas = document.createElement('canvas');
  canvas.width = BOARD_PROMO_IMAGE_WIDTH;
  canvas.height = BOARD_PROMO_IMAGE_HEIGHT;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('This browser could not prepare the promo image.');

  const qrUrl = spec.showQrCode
    ? generateQrSvgDataUrl(boardUrl, { errorCorrectionLevel: 'H', margin: 4 })
    : '';
  const [coverImage, qrImage] = await Promise.all([
    loadPromoImage(spec.coverImageUrl),
    loadPromoImage(qrUrl),
  ]);
  if (spec.showQrCode && !qrImage) {
    coverImage?.close();
    throw new Error('The QR code could not be prepared. Try downloading again.');
  }

  try {
    drawPromoBackground(context);
    drawPromoCover(context, coverImage, spec.icon || 'dashboard_customize');
    drawPromoBrand(context);
    drawPromoCopy(context, { ...spec, title });
    drawPromoDestination(context, boardUrl, qrImage, spec.showQrCode);
    return await canvasToPngBlob(canvas);
  } finally {
    coverImage?.close();
    qrImage?.close();
  }
}

function drawPromoBackground(context: CanvasRenderingContext2D): void {
  context.fillStyle = '#0a3025';
  context.fillRect(0, 0, BOARD_PROMO_IMAGE_WIDTH, BOARD_PROMO_IMAGE_HEIGHT);
  const glow = context.createRadialGradient(310, 190, 20, 310, 190, 820);
  glow.addColorStop(0, 'rgba(73,155,118,.3)');
  glow.addColorStop(0.58, 'rgba(30,91,68,.12)');
  glow.addColorStop(1, 'rgba(10,48,37,0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, 1460, BOARD_PROMO_IMAGE_HEIGHT);

  context.strokeStyle = 'rgba(214,181,90,.68)';
  context.lineWidth = 2;
  for (let index = 0; index < 5; index += 1) {
    const offset = index * 30;
    context.beginPath();
    context.moveTo(0, 152 - offset);
    context.lineTo(152 - offset, 152 - offset);
    context.lineTo(152 - offset, 0);
    context.stroke();
  }
}

function drawPromoCover(
  context: CanvasRenderingContext2D,
  image: PromoLoadedImage | null,
  icon: string,
): void {
  const x = 1390;
  const width = BOARD_PROMO_IMAGE_WIDTH - x;
  if (image) {
    drawImageCover(context, image, x, 0, width, BOARD_PROMO_IMAGE_HEIGHT);
  } else {
    const fallback = context.createLinearGradient(x, 0, BOARD_PROMO_IMAGE_WIDTH, BOARD_PROMO_IMAGE_HEIGHT);
    fallback.addColorStop(0, '#3a7460');
    fallback.addColorStop(0.55, '#d6e0d8');
    fallback.addColorStop(1, '#b8cabf');
    context.fillStyle = fallback;
    context.fillRect(x, 0, width, BOARD_PROMO_IMAGE_HEIGHT);
    context.fillStyle = 'rgba(10,48,37,.14)';
    context.font = '180px "Material Symbols Outlined", Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(icon, x + width / 2, BOARD_PROMO_IMAGE_HEIGHT / 2);
  }

  const imageShade = context.createLinearGradient(x, 0, BOARD_PROMO_IMAGE_WIDTH, 0);
  imageShade.addColorStop(0, 'rgba(10,48,37,.82)');
  imageShade.addColorStop(0.14, 'rgba(10,48,37,.28)');
  imageShade.addColorStop(0.45, 'rgba(10,48,37,0)');
  context.fillStyle = imageShade;
  context.fillRect(x, 0, width, BOARD_PROMO_IMAGE_HEIGHT);

  const bottomShade = context.createLinearGradient(0, 860, 0, BOARD_PROMO_IMAGE_HEIGHT);
  bottomShade.addColorStop(0, 'rgba(5,25,19,0)');
  bottomShade.addColorStop(1, 'rgba(5,25,19,.18)');
  context.fillStyle = bottomShade;
  context.fillRect(x, 0, width, BOARD_PROMO_IMAGE_HEIGHT);
}

function drawPromoBrand(context: CanvasRenderingContext2D): void {
  context.save();
  context.fillStyle = 'rgba(255,255,255,.08)';
  roundedRect(context, 112, 72, 320, 78, 39);
  context.fill();
  context.strokeStyle = 'rgba(255,253,243,.34)';
  context.lineWidth = 2;
  context.stroke();

  context.strokeStyle = '#d6b55a';
  context.lineWidth = 5;
  roundedRect(context, 139, 94, 37, 42, 7);
  context.stroke();
  roundedRect(context, 159, 102, 37, 42, 7);
  context.stroke();
  context.fillStyle = '#fffdf3';
  context.font = '800 38px Inter, Arial, sans-serif';
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillText('LivingWiki', 220, 112);
  context.restore();
}

function drawPromoCopy(context: CanvasRenderingContext2D, spec: BoardPromoImageSpec): void {
  const x = 112;
  const maxWidth = 1155;
  const boardType = (spec.boardTypeLabel || 'Board').trim().toUpperCase();
  const count = Math.max(0, Math.round(spec.cardCount));
  context.fillStyle = '#d6b55a';
  context.font = '900 28px Inter, Arial, sans-serif';
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.letterSpacing = '5px';
  context.fillText(`${boardType}  ·  ${count} ${count === 1 ? 'CARD' : 'CARDS'}`, x, 226);
  context.letterSpacing = '0px';

  const titleFontSize = boardPromoTitleFontSize(spec.title);
  context.fillStyle = '#fffdf3';
  context.font = `600 ${titleFontSize}px Georgia, "Times New Roman", serif`;
  const titleLines = boardPromoTextLines(spec.title, maxWidth, (value) => context.measureText(value).width, 3);
  const titleLineHeight = titleFontSize * 0.96;
  const titleY = 350;
  titleLines.forEach((line, index) => context.fillText(line, x, titleY + index * titleLineHeight));
  const titleBottom = titleY + Math.max(0, titleLines.length - 1) * titleLineHeight;

  let descriptionBottom = titleBottom;
  if (spec.showDescription && spec.description.trim()) {
    context.fillStyle = 'rgba(255,253,243,.79)';
    context.font = '520 34px Inter, Arial, sans-serif';
    const descriptionLines = boardPromoTextLines(
      spec.description,
      1120,
      (value) => context.measureText(value).width,
      titleLines.length >= 3 ? 2 : 3,
    );
    const descriptionY = titleBottom + 72;
    descriptionLines.forEach((line, index) => context.fillText(line, x, descriptionY + index * 50));
    descriptionBottom = descriptionY + Math.max(0, descriptionLines.length - 1) * 50;
  }

  const metaY = Math.min(820, Math.max(titleBottom + 86, descriptionBottom + 68));
  context.fillStyle = '#d6b55a';
  context.beginPath();
  context.arc(x + 17, metaY - 11, 17, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = 'rgba(255,253,243,.82)';
  context.font = '650 28px Inter, Arial, sans-serif';
  const owner = spec.ownerName.trim() || 'LivingWiki curator';
  const updated = spec.updatedLabel.trim() || 'today';
  context.fillText(`Curated by `, x + 56, metaY);
  const prefixWidth = context.measureText('Curated by ').width;
  context.fillStyle = '#d6b55a';
  context.font = '800 28px Inter, Arial, sans-serif';
  context.fillText(owner, x + 56 + prefixWidth, metaY);
  const ownerWidth = context.measureText(owner).width;
  context.fillStyle = 'rgba(255,253,243,.48)';
  context.font = '650 28px Inter, Arial, sans-serif';
  context.fillText('  •  ', x + 56 + prefixWidth + ownerWidth, metaY);
  const separatorWidth = context.measureText('  •  ').width;
  context.fillStyle = 'rgba(255,253,243,.72)';
  context.fillText(`Updated ${updated}`, x + 56 + prefixWidth + ownerWidth + separatorWidth, metaY);
}

function drawPromoDestination(
  context: CanvasRenderingContext2D,
  boardUrl: string,
  qrImage: PromoLoadedImage | null,
  showQrCode: boolean,
): void {
  const x = 112;
  const displayUrl = boardPromoDisplayUrl(boardUrl);
  if (!showQrCode || !qrImage) {
    context.fillStyle = 'rgba(255,255,255,.075)';
    roundedRect(context, x, 930, 1130, 164, 28);
    context.fill();
    context.strokeStyle = 'rgba(255,253,243,.42)';
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = '#d6b55a';
    context.font = '900 24px Inter, Arial, sans-serif';
    context.letterSpacing = '4px';
    context.fillText('EXPLORE THIS BOARD', x + 38, 988);
    context.letterSpacing = '0px';
    context.fillStyle = '#fffdf3';
    context.font = '720 31px Inter, Arial, sans-serif';
    const linkLines = boardPromoTextLines(displayUrl, 1055, (value) => context.measureText(value).width, 2);
    linkLines.forEach((line, index) => context.fillText(line, x + 38, 1044 + index * 38));
    return;
  }

  const qrSize = 254;
  const qrY = 894;
  context.fillStyle = '#ffffff';
  roundedRect(context, x, qrY, qrSize, qrSize, 22);
  context.fill();
  context.drawImage(qrImage.source, x, qrY, qrSize, qrSize);

  const copyX = x + qrSize + 42;
  context.fillStyle = '#d6b55a';
  context.font = '900 24px Inter, Arial, sans-serif';
  context.letterSpacing = '4px';
  context.fillText('SCAN TO EXPLORE', copyX, 966);
  context.letterSpacing = '0px';
  context.fillStyle = '#fffdf3';
  context.font = '800 38px Inter, Arial, sans-serif';
  context.fillText('Open the complete board', copyX, 1020);
  context.fillStyle = 'rgba(255,253,243,.68)';
  context.font = '620 27px Inter, Arial, sans-serif';
  const urlLines = boardPromoTextLines(displayUrl, 800, (value) => context.measureText(value).width, 2);
  urlLines.forEach((line, index) => context.fillText(line, copyX, 1070 + index * 36));
}

function truncateMeasuredText(
  value: string,
  maxWidth: number,
  measure: (text: string) => number,
): string {
  const text = value.trim();
  if (!text || measure(text) <= maxWidth) return text;
  const withoutEllipsis = text.replace(/…+$/, '').trimEnd();
  let low = 0;
  let high = withoutEllipsis.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = `${withoutEllipsis.slice(0, middle).trimEnd()}…`;
    if (measure(candidate) <= maxWidth) low = middle;
    else high = middle - 1;
  }
  return `${withoutEllipsis.slice(0, low).trimEnd()}…`;
}

async function loadPromoImage(url: string): Promise<PromoLoadedImage | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(blob);
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          close: () => bitmap.close(),
        };
      } catch {
        // SVG support for createImageBitmap varies; use an HTML image below.
      }
    }
    return await loadHtmlImage(blob);
  } catch {
    return null;
  }
}

function loadHtmlImage(blob: Blob): Promise<PromoLoadedImage | null> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => resolve({
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(objectUrl),
    });
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    image.src = objectUrl;
  });
}

function drawImageCover(
  context: CanvasRenderingContext2D,
  image: PromoLoadedImage,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const targetRatio = width / height;
  const imageRatio = image.width / image.height;
  let sourceWidth = image.width;
  let sourceHeight = image.height;
  if (imageRatio > targetRatio) sourceWidth = image.height * targetRatio;
  else sourceHeight = image.width / targetRatio;
  context.drawImage(
    image.source,
    (image.width - sourceWidth) / 2,
    (image.height - sourceHeight) / 2,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
  );
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('The promo image could not be encoded.'));
    }, 'image/png');
  });
}
