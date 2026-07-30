export type StackVideoRatio = 'vertical' | 'square' | 'landscape';

export type StackVideoCard = {
  title: string;
  subtitle: string;
  notes: string;
  status: string;
  rating: number;
  imageUrl: string;
  imageUrls: string[];
  tourSequence?: number | null;
};

export type StackVideoBoard = {
  title: string;
  subtitle: string;
  ownerName: string;
  coverImageUrl: string;
  liveUrl: string;
  qrImageUrl: string;
  cards: StackVideoCard[];
};

export type StackVideoResult = {
  blob: Blob;
  mimeType: string;
  extension: 'mp4' | 'webm';
  xCompatible: boolean;
  durationSeconds: number;
};

export type StackVideoBackgroundAudio = {
  url: string;
  volume: number;
};

type LoadedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
};

type PreparedBackgroundAudio = {
  tracks: MediaStreamTrack[];
  start: () => void;
  close: () => Promise<void>;
};

type VideoFrame =
  | { kind: 'cover' }
  | { kind: 'card'; card: StackVideoCard; cardIndex: number }
  | { kind: 'closing' };

const FRAME_RATE = 30;
const FRAME_DURATION_MS = 1900;
const CLOSING_DURATION_MS = 2100;

export function stackVideoCardImageCandidates(card: Pick<StackVideoCard, 'imageUrl' | 'imageUrls'>): string[] {
  return Array.from(new Set(
    [card.imageUrl, ...(card.imageUrls ?? [])]
      .map((url) => url.trim())
      .filter(Boolean),
  ));
}

export async function generateStackVideo(
  board: StackVideoBoard,
  ratio: StackVideoRatio,
  onProgress?: (progress: number) => void,
  backgroundAudio?: StackVideoBackgroundAudio | null,
): Promise<StackVideoResult> {
  if (typeof document === 'undefined' || typeof MediaRecorder === 'undefined') {
    throw new Error('Video export is not supported in this browser.');
  }

  const mimeType = preferredRecorderMimeType(!!backgroundAudio?.url);
  if (!mimeType) {
    throw new Error('This browser cannot record a social video.');
  }

  const { width, height } = dimensionsForRatio(ratio);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    throw new Error('Could not prepare the video canvas.');
  }

  const images = new Map<string, LoadedImage>();
  const pendingImages = new Map<string, Promise<LoadedImage | null>>();
  const loadCachedImage = async (url: string): Promise<LoadedImage | null> => {
    if (!url) return null;
    let pending = pendingImages.get(url);
    if (!pending) {
      pending = loadImage(url);
      pendingImages.set(url, pending);
    }
    const image = await pending;
    if (image) images.set(url, image);
    return image;
  };
  await Promise.all([
    loadCachedImage(board.coverImageUrl),
    loadCachedImage(board.qrImageUrl),
    ...board.cards.map(async (card) => {
      for (const imageUrl of stackVideoCardImageCandidates(card)) {
        if (await loadCachedImage(imageUrl)) return;
      }
    }),
  ]);

  const frames: VideoFrame[] = [
    { kind: 'cover' },
    ...board.cards.map((card, cardIndex) => ({ kind: 'card' as const, card, cardIndex })),
    { kind: 'closing' },
  ];
  const frameDurations = frames.map((frame) => frame.kind === 'closing' ? CLOSING_DURATION_MS : FRAME_DURATION_MS);
  const totalDurationMs = frameDurations.reduce((total, duration) => total + duration, 0);
  const canvasStream = canvas.captureStream(FRAME_RATE);
  const preparedAudio = backgroundAudio?.url
    ? await prepareBackgroundAudio(backgroundAudio, totalDurationMs / 1000)
    : null;
  const stream = combineStackVideoMediaStream(canvasStream, preparedAudio?.tracks);
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: ratio === 'landscape' ? 5_500_000 : 5_000_000,
    ...(preparedAudio ? { audioBitsPerSecond: 192_000 } : {}),
  });
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size) chunks.push(event.data);
  });

  try {
    recorder.start(500);
    preparedAudio?.start();
    let elapsedMs = 0;
    for (let index = 0; index < frames.length; index += 1) {
      const frame = frames[index];
      const durationMs = frameDurations[index];
      const startedAt = performance.now();
      while (true) {
        const frameElapsedMs = Math.min(durationMs, performance.now() - startedAt);
        renderFrame(context, width, height, board, frame, images, frameElapsedMs / durationMs, index, frames.length);
        onProgress?.(Math.min(0.99, (elapsedMs + frameElapsedMs) / totalDurationMs));
        if (frameElapsedMs >= durationMs) break;
        await nextAnimationFrame();
      }
      elapsedMs += durationMs;
    }
    await stopRecorder(recorder);
    onProgress?.(1);
  } finally {
    for (const image of images.values()) image.close();
    for (const track of stream.getTracks()) track.stop();
    for (const track of canvasStream.getTracks()) track.stop();
    await preparedAudio?.close();
  }

  if (!chunks.length) {
    throw new Error('The browser did not produce a video file.');
  }
  const recordedType = recorder.mimeType || mimeType;
  const extension = recordedType.includes('mp4') ? 'mp4' : 'webm';
  return {
    blob: new Blob(chunks, { type: recordedType }),
    mimeType: recordedType,
    extension,
    xCompatible: extension === 'mp4',
    durationSeconds: Math.round(totalDurationMs / 100) / 10,
  };
}

export function combineStackVideoMediaStream(
  canvasStream: MediaStream,
  audioTracks: readonly MediaStreamTrack[] = [],
): MediaStream {
  if (!audioTracks.length) return canvasStream;
  return new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);
}

export function preferredRecorderMimeType(hasAudio = false): string {
  const candidates = hasAudio
    ? [
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4;codecs=avc1,mp4a.40.2',
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ]
    : [
        'video/mp4;codecs=avc1.42E01E',
        'video/mp4;codecs=avc1',
        'video/mp4',
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
      ];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? '';
}

function dimensionsForRatio(ratio: StackVideoRatio): { width: number; height: number } {
  if (ratio === 'square') return { width: 720, height: 720 };
  if (ratio === 'landscape') return { width: 1280, height: 720 };
  return { width: 720, height: 1280 };
}

async function loadImage(url: string): Promise<LoadedImage | null> {
  try {
    const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!response.ok) return null;
    const bitmap = await createImageBitmap(await response.blob());
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  } catch {
    return null;
  }
}

async function prepareBackgroundAudio(
  audio: StackVideoBackgroundAudio,
  durationSeconds: number,
): Promise<PreparedBackgroundAudio> {
  const AudioContextConstructor = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) {
    throw new Error('This browser cannot add background music to the video.');
  }

  const response = await fetch(audio.url, { mode: 'cors', credentials: 'omit' });
  if (!response.ok) {
    throw new Error('The selected background music could not be loaded. Choose another mood and try again.');
  }

  const context = new AudioContextConstructor();
  let started = false;
  try {
    await context.resume();
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    const source = context.createBufferSource();
    const gain = context.createGain();
    const destination = context.createMediaStreamDestination();
    const volume = Math.min(0.5, Math.max(0, audio.volume));
    source.buffer = buffer;
    source.loop = buffer.duration + 0.05 < durationSeconds;
    source.connect(gain);
    gain.connect(destination);

    return {
      tracks: destination.stream.getAudioTracks(),
      start: () => {
        const now = context.currentTime;
        const fadeInSeconds = Math.min(0.7, Math.max(0.15, durationSeconds / 4));
        const fadeOutSeconds = Math.min(1.2, Math.max(0.2, durationSeconds / 4));
        const fadeOutAt = now + Math.max(fadeInSeconds, durationSeconds - fadeOutSeconds);
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(volume, now + fadeInSeconds);
        gain.gain.setValueAtTime(volume, fadeOutAt);
        gain.gain.linearRampToValueAtTime(0.0001, now + durationSeconds);
        source.start(now);
        started = true;
      },
      close: async () => {
        if (started) {
          try {
            source.stop();
          } catch {
            // The source already ended with the recording.
          }
        }
        source.disconnect();
        gain.disconnect();
        destination.disconnect();
        await context.close();
      },
    };
  } catch (error) {
    await context.close();
    if (error instanceof Error && error.message) throw error;
    throw new Error('The selected background music could not be prepared.');
  }
}

function renderFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  board: StackVideoBoard,
  frame: VideoFrame,
  images: Map<string, LoadedImage>,
  progress: number,
  frameIndex: number,
  frameCount: number,
): void {
  context.save();
  context.clearRect(0, 0, width, height);
  drawBackdrop(context, width, height);
  if (frame.kind === 'cover') {
    drawCoverFrame(context, width, height, board, images.get(board.coverImageUrl), progress);
  } else if (frame.kind === 'card') {
    drawCardFrame(
      context,
      width,
      height,
      frame.card,
      frame.cardIndex,
      board.cards.length,
      firstLoadedCardImage(frame.card, images),
      progress,
    );
  } else {
    drawClosingFrame(context, width, height, board, images.get(board.qrImageUrl), progress);
  }
  drawTimeline(context, width, height, frameIndex, frameCount, progress);
  context.restore();
}

function firstLoadedCardImage(
  card: Pick<StackVideoCard, 'imageUrl' | 'imageUrls'>,
  images: ReadonlyMap<string, LoadedImage>,
): LoadedImage | undefined {
  for (const imageUrl of stackVideoCardImageCandidates(card)) {
    const image = images.get(imageUrl);
    if (image) return image;
  }
  return undefined;
}

function drawBackdrop(context: CanvasRenderingContext2D, width: number, height: number): void {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#0c5f4c');
  gradient.addColorStop(0.55, '#13271f');
  gradient.addColorStop(1, '#07100d');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.globalAlpha = 0.12;
  context.fillStyle = '#ffffff';
  const grid = Math.max(28, Math.round(width / 18));
  for (let x = 0; x < width; x += grid) context.fillRect(x, 0, 1, height);
  for (let y = 0; y < height; y += grid) context.fillRect(0, y, width, 1);
  context.globalAlpha = 1;
}

function drawCoverFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  board: StackVideoBoard,
  image: LoadedImage | undefined,
  progress: number,
): void {
  if (image) drawCoverImage(context, image, width, height, 1.03 + progress * 0.025);
  drawShade(context, width, height, image ? 0.82 : 0.34);
  drawBrandPill(context, width, height);
  const padding = width * 0.075;
  const bottom = height * 0.16;
  const reveal = easeOut(Math.min(1, progress * 2.8));
  context.save();
  context.globalAlpha = reveal;
  context.translate(0, (1 - reveal) * height * 0.035);
  context.fillStyle = '#bdfbe3';
  context.font = `800 ${Math.round(width * 0.032)}px Inter, Arial, sans-serif`;
  context.letterSpacing = `${Math.round(width * 0.004)}px`;
  context.fillText('A LIVINGWIKI STACK', padding, height - bottom - width * 0.3);
  context.letterSpacing = '0px';
  context.fillStyle = '#ffffff';
  context.font = `950 ${Math.round(width * 0.105)}px Inter, Arial, sans-serif`;
  drawWrappedText(context, board.title, padding, height - bottom - width * 0.21, width - padding * 2, width * 0.108, 3);
  context.fillStyle = 'rgba(255,255,255,.86)';
  context.font = `750 ${Math.round(width * 0.038)}px Inter, Arial, sans-serif`;
  drawWrappedText(context, board.subtitle, padding, height - bottom + width * 0.09, width - padding * 2, width * 0.052, 2);
  context.restore();
}

function drawCardFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  card: StackVideoCard,
  cardIndex: number,
  cardCount: number,
  image: LoadedImage | undefined,
  progress: number,
): void {
  if (image) drawCoverImage(context, image, width, height, 1.02 + progress * 0.03);
  drawShade(context, width, height, image ? 0.86 : 0.38);
  drawBrandPill(context, width, height);
  const padding = width * 0.075;
  const reveal = easeOut(Math.min(1, progress * 3));
  context.save();
  context.globalAlpha = reveal;
  context.translate(0, (1 - reveal) * height * 0.035);
  context.fillStyle = '#bdfbe3';
  context.font = `850 ${Math.round(width * 0.032)}px Inter, Arial, sans-serif`;
  const kicker = card.tourSequence
    ? `TOUR STOP ${card.tourSequence}  ·  ${cardIndex + 1} OF ${cardCount}`
    : `${card.status.toUpperCase()}  ·  ${cardIndex + 1} OF ${cardCount}`;
  context.fillText(kicker, padding, height * 0.64);
  context.fillStyle = '#ffffff';
  context.font = `950 ${Math.round(width * 0.09)}px Inter, Arial, sans-serif`;
  const titleBottom = drawWrappedText(context, card.title, padding, height * 0.69, width - padding * 2, width * 0.095, 3);
  const detail = card.subtitle || card.notes;
  if (detail) {
    context.fillStyle = 'rgba(255,255,255,.86)';
    context.font = `750 ${Math.round(width * 0.037)}px Inter, Arial, sans-serif`;
    drawWrappedText(context, detail, padding, titleBottom + width * 0.036, width - padding * 2, width * 0.052, 3);
  }
  const badges: string[] = [];
  if (card.rating > 0) badges.push(`${'★'.repeat(Math.min(5, Math.round(card.rating)))} ${card.rating}/5`);
  const memoryCount = Math.max(0, card.imageUrls.length - (card.imageUrl ? 1 : 0));
  if (memoryCount > 0) badges.push(`${memoryCount} ${memoryCount === 1 ? 'memory' : 'memories'}`);
  drawBadges(context, badges, padding, height - width * 0.13, width);
  context.restore();
}

function drawClosingFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  board: StackVideoBoard,
  qrImage: LoadedImage | undefined,
  progress: number,
): void {
  const reveal = easeOut(Math.min(1, progress * 2.5));
  context.save();
  context.globalAlpha = reveal;
  context.translate(0, (1 - reveal) * height * 0.025);
  context.textAlign = 'center';
  context.fillStyle = '#bdfbe3';
  context.font = `850 ${Math.round(width * 0.034)}px Inter, Arial, sans-serif`;
  context.fillText('KEEP EXPLORING', width / 2, height * 0.24);
  context.fillStyle = '#ffffff';
  context.font = `950 ${Math.round(width * 0.092)}px Inter, Arial, sans-serif`;
  drawWrappedText(context, board.title, width * 0.1, height * 0.3, width * 0.8, width * 0.098, 3, 'center');
  if (qrImage) {
    const qrSize = Math.min(width * 0.36, height * 0.27);
    const x = (width - qrSize) / 2;
    const y = height * 0.56;
    roundedRect(context, x - 12, y - 12, qrSize + 24, qrSize + 24, 22);
    context.fillStyle = '#ffffff';
    context.fill();
    context.drawImage(qrImage.source, x, y, qrSize, qrSize);
  }
  context.fillStyle = 'rgba(255,255,255,.76)';
  context.font = `750 ${Math.round(width * 0.028)}px Inter, Arial, sans-serif`;
  context.fillText('Made with LivingWiki', width / 2, height * 0.89);
  context.font = `800 ${Math.round(width * 0.024)}px Inter, Arial, sans-serif`;
  context.fillText(shortDisplayUrl(board.liveUrl), width / 2, height * 0.93);
  context.restore();
}

function drawBrandPill(context: CanvasRenderingContext2D, width: number, height: number): void {
  const x = width * 0.065;
  const y = height * 0.055;
  const pillWidth = width * 0.31;
  const pillHeight = Math.max(34, width * 0.065);
  roundedRect(context, x, y, pillWidth, pillHeight, pillHeight / 2);
  context.fillStyle = 'rgba(4,18,14,.58)';
  context.fill();
  context.strokeStyle = 'rgba(255,255,255,.45)';
  context.lineWidth = 2;
  context.stroke();
  context.fillStyle = '#ffffff';
  context.font = `900 ${Math.round(width * 0.027)}px Inter, Arial, sans-serif`;
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillText('◈  LivingWiki', x + pillHeight * 0.35, y + pillHeight / 2);
  context.textBaseline = 'alphabetic';
}

function drawTimeline(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  activeIndex: number,
  count: number,
  progress: number,
): void {
  const gap = Math.max(5, width * 0.008);
  const padding = width * 0.065;
  const segmentWidth = (width - padding * 2 - gap * (count - 1)) / count;
  const y = height * 0.025;
  for (let index = 0; index < count; index += 1) {
    const x = padding + index * (segmentWidth + gap);
    roundedRect(context, x, y, segmentWidth, Math.max(4, width * 0.008), 999);
    context.fillStyle = 'rgba(255,255,255,.28)';
    context.fill();
    if (index <= activeIndex) {
      roundedRect(context, x, y, segmentWidth * (index < activeIndex ? 1 : Math.min(1, progress)), Math.max(4, width * 0.008), 999);
      context.fillStyle = '#ffffff';
      context.fill();
    }
  }
}

function drawCoverImage(
  context: CanvasRenderingContext2D,
  image: LoadedImage,
  width: number,
  height: number,
  scale: number,
): void {
  const targetRatio = width / height;
  const imageRatio = image.width / image.height;
  let sourceWidth = image.width;
  let sourceHeight = image.height;
  if (imageRatio > targetRatio) sourceWidth = image.height * targetRatio;
  else sourceHeight = image.width / targetRatio;
  sourceWidth /= scale;
  sourceHeight /= scale;
  const sourceX = (image.width - sourceWidth) / 2;
  const sourceY = (image.height - sourceHeight) / 2;
  context.drawImage(image.source, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
}

function drawShade(context: CanvasRenderingContext2D, width: number, height: number, strength: number): void {
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, `rgba(0,0,0,${strength * 0.26})`);
  gradient.addColorStop(0.42, `rgba(0,0,0,${strength * 0.16})`);
  gradient.addColorStop(1, `rgba(0,0,0,${strength})`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

function drawBadges(context: CanvasRenderingContext2D, badges: string[], x: number, y: number, width: number): void {
  let cursor = x;
  context.font = `850 ${Math.round(width * 0.027)}px Inter, Arial, sans-serif`;
  context.textBaseline = 'middle';
  for (const badge of badges) {
    const badgeWidth = context.measureText(badge).width + width * 0.055;
    roundedRect(context, cursor, y - width * 0.031, badgeWidth, width * 0.062, width * 0.031);
    context.fillStyle = 'rgba(255,255,255,.17)';
    context.fill();
    context.strokeStyle = 'rgba(255,255,255,.45)';
    context.lineWidth = 1.5;
    context.stroke();
    context.fillStyle = '#ffffff';
    context.fillText(badge, cursor + width * 0.0275, y);
    cursor += badgeWidth + width * 0.018;
  }
  context.textBaseline = 'alphabetic';
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
  align: CanvasTextAlign = 'left',
): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = candidate;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    while (lines[maxLines - 1].length && context.measureText(`${lines[maxLines - 1]}…`).width > maxWidth) {
      lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1);
    }
    lines[maxLines - 1] = `${lines[maxLines - 1].trim()}…`;
  }
  context.textAlign = align;
  const drawX = align === 'center' ? x + maxWidth / 2 : x;
  lines.forEach((value, index) => context.fillText(value, drawX, y + index * lineHeight));
  context.textAlign = 'left';
  return y + Math.max(0, lines.length - 1) * lineHeight;
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

function shortDisplayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return url.replace(/^https?:\/\//, '');
  }
}

function easeOut(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function stopRecorder(recorder: MediaRecorder): Promise<void> {
  return new Promise((resolve, reject) => {
    recorder.addEventListener('stop', () => resolve(), { once: true });
    recorder.addEventListener('error', () => reject(new Error('Video recording failed.')), { once: true });
    recorder.stop();
  });
}
