export type StackVideoRatio = 'vertical' | 'square' | 'landscape';

export type StackVideoCard = {
  title: string;
  subtitle: string;
  notes: string;
  rank?: number | null;
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
  showCardNumbers: boolean;
  closingScreen?: Partial<StackVideoClosingScreen> | null;
  cards: StackVideoCard[];
};

export type StackVideoClosingImage = 'cover' | 'final-card' | 'custom';

export type StackVideoClosingScreen = {
  headline: string;
  message: string;
  showQrCode: boolean;
  image: StackVideoClosingImage;
  customImageUrl: string;
  durationSeconds: number;
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

export type StackVideoNarration = {
  cardAudioUrls: Array<string | null>;
  volume: number;
};

export type StackTrailerNarration = {
  audioUrl: string;
  script: string;
  volume: number;
};

export type StackTrailerPlan = {
  durationMs: number;
  frameDurationsMs: number[];
  cardDurationMs: number;
};

export type StackVideoRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type StackVideoLandscapeLayout = {
  image: StackVideoRect;
  content: StackVideoRect;
};

type LoadedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
};

type PreparedVideoAudio = {
  tracks: MediaStreamTrack[];
  frameDurationsMs: number[];
  start: () => void;
  close: () => Promise<void>;
};

type PreparedTrailerAudio = {
  tracks: MediaStreamTrack[];
  frameDurationsMs: number[];
  start: () => void;
  close: () => Promise<void>;
};

type VideoFrame =
  | { kind: 'cover' }
  | { kind: 'card'; card: StackVideoCard }
  | { kind: 'closing' };

const FRAME_RATE = 15;
const FRAME_DURATION_MS = 2200;
const DEFAULT_CLOSING_DURATION_SECONDS = 3;
const NARRATION_LEAD_MS = 100;
const NARRATION_TAIL_MS = 350;

export const STACK_VIDEO_RENDER_VERSION = 'stack-video-v15';
export const STACK_TRAILER_RENDER_VERSION = 'board-trailer-v3';
export const STACK_VIDEO_BRAND_URL = 'LivingWiki.com';

export function publishedStackVideoStoragePath(
  uid: string,
  boardId: string,
  videoKind: 'full' | 'trailer',
  extension: StackVideoResult['extension'],
  generationId: string,
): string {
  return `users/${uid}/boards/${boardId}/social/${videoKind}/${generationId}.${extension}`;
}

const TRAILER_MIN_DURATION_MS = 15_000;
const TRAILER_MAX_DURATION_MS = 30_000;
const TRAILER_COVER_DURATION_MS = 2_250;
const TRAILER_MONTAGE_DURATION_MS = 1_750;
const TRAILER_CLOSING_DURATION_MS = 2_350;
const TRAILER_VOICE_LEAD_MS = 850;

export function stackTrailerPlan(cardCount: number, narrationSeconds = 0): StackTrailerPlan {
  const safeCardCount = Math.max(1, Math.min(30, Math.floor(cardCount) || 1));
  const visualTarget = TRAILER_COVER_DURATION_MS
    + TRAILER_MONTAGE_DURATION_MS
    + TRAILER_CLOSING_DURATION_MS
    + safeCardCount * 1_250;
  const narratedTarget = Number.isFinite(narrationSeconds) && narrationSeconds > 0
    ? Math.ceil(narrationSeconds * 1000) + TRAILER_VOICE_LEAD_MS + 1_100
    : 0;
  const durationMs = Math.min(
    TRAILER_MAX_DURATION_MS,
    Math.max(TRAILER_MIN_DURATION_MS, visualTarget, narratedTarget),
  );
  const fixedDuration = TRAILER_COVER_DURATION_MS + TRAILER_MONTAGE_DURATION_MS + TRAILER_CLOSING_DURATION_MS;
  const cardDurationMs = Math.max(380, Math.floor((durationMs - fixedDuration) / safeCardCount));
  const frameDurationsMs = [
    TRAILER_COVER_DURATION_MS,
    ...Array.from({ length: safeCardCount }, () => cardDurationMs),
    TRAILER_MONTAGE_DURATION_MS,
    TRAILER_CLOSING_DURATION_MS,
  ];
  const remainder = durationMs - frameDurationsMs.reduce((sum, value) => sum + value, 0);
  frameDurationsMs[frameDurationsMs.length - 1] += remainder;
  return { durationMs, frameDurationsMs, cardDurationMs };
}

export function stackTrailerCaptionChunks(script: string, maxWords = 9): string[] {
  const words = script.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const chunks: string[] = [];
  let current: string[] = [];
  for (const word of words) {
    current.push(word);
    const endsThought = /[.!?;:]$/.test(word);
    if (current.length >= maxWords || (endsThought && current.length >= 4)) {
      chunks.push(current.join(' '));
      current = [];
    }
  }
  if (current.length) chunks.push(current.join(' '));
  return chunks;
}

export function stackVideoRenderIsCurrent(version: unknown): boolean {
  return version === STACK_VIDEO_RENDER_VERSION;
}

export function stackVideoContainRect(
  sourceWidth: number,
  sourceHeight: number,
  target: StackVideoRect,
): StackVideoRect {
  if (sourceWidth <= 0 || sourceHeight <= 0 || target.width <= 0 || target.height <= 0) {
    return { ...target, width: 0, height: 0 };
  }
  const scale = Math.min(target.width / sourceWidth, target.height / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: target.x + (target.width - width) / 2,
    y: target.y + (target.height - height) / 2,
    width,
    height,
  };
}

export function stackVideoLandscapeLayout(width: number, height: number): StackVideoLandscapeLayout {
  const margin = height * 0.067;
  const gap = height * 0.05;
  const top = height * 0.08;
  const panelHeight = height * 0.84;
  const availableWidth = Math.max(0, width - margin * 2 - gap);
  const imageWidth = availableWidth * 0.6;
  return {
    image: { x: margin, y: top, width: imageWidth, height: panelHeight },
    content: {
      x: margin + imageWidth + gap,
      y: top,
      width: availableWidth - imageWidth,
      height: panelHeight,
    },
  };
}

export function normalizeStackVideoClosingScreen(
  value: Partial<StackVideoClosingScreen> | null | undefined,
  boardTitle = '',
): StackVideoClosingScreen {
  const duration = typeof value?.durationSeconds === 'number' ? value.durationSeconds : Number.NaN;
  const headline = typeof value?.headline === 'string' ? value.headline : '';
  const message = typeof value?.message === 'string' ? value.message : '';
  const customImageUrl = typeof value?.customImageUrl === 'string' ? value.customImageUrl.trim() : '';
  const image: StackVideoClosingImage = value?.image === 'custom'
    ? customImageUrl ? 'custom' : 'cover'
    : value?.image === 'final-card' ? 'final-card' : 'cover';
  return {
    headline: headline.trim().slice(0, 72) || 'Keep exploring',
    message: message.trim().slice(0, 180) || boardTitle.trim().slice(0, 180),
    showQrCode: value?.showQrCode !== false,
    image,
    customImageUrl,
    durationSeconds: Number.isFinite(duration)
      ? Math.min(6, Math.max(2, Math.round(duration * 2) / 2))
      : DEFAULT_CLOSING_DURATION_SECONDS,
  };
}

export function stackVideoClosingDurationMs(
  value: Partial<StackVideoClosingScreen> | null | undefined,
): number {
  return Math.round(normalizeStackVideoClosingScreen(value).durationSeconds * 1000);
}

export function stackVideoCardVisibleText(
  card: Pick<StackVideoCard, 'title' | 'subtitle' | 'notes' | 'rank' | 'tourSequence'>,
): string[] {
  return [card.title];
}

export function stackVideoCardImageCandidates(card: Pick<StackVideoCard, 'imageUrl' | 'imageUrls'>): string[] {
  return Array.from(new Set(
    [card.imageUrl, ...(card.imageUrls ?? [])]
      .map((url) => url.trim())
      .filter(Boolean),
  ));
}

export function stackVideoNarrationFrameDurationMs(durationSeconds: number, baseDurationMs = FRAME_DURATION_MS): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return baseDurationMs;
  return Math.max(baseDurationMs, Math.ceil(durationSeconds * 1000) + NARRATION_LEAD_MS + NARRATION_TAIL_MS);
}

export function stackVideoNarrationIsComplete(
  cardCount: number,
  narration: StackVideoNarration | null | undefined,
): boolean {
  if (!narration || cardCount < 1 || narration.cardAudioUrls.length < cardCount) return false;
  return narration.cardAudioUrls.slice(0, cardCount).every((url) => !!url?.trim());
}

export function stackVideoFrameAtElapsed(
  frameDurationsMs: readonly number[],
  elapsedMs: number,
): { index: number; progress: number } {
  if (!frameDurationsMs.length) return { index: 0, progress: 1 };
  const safeElapsedMs = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
  let frameStartMs = 0;
  for (let index = 0; index < frameDurationsMs.length; index += 1) {
    const durationMs = Math.max(1, frameDurationsMs[index]);
    const frameEndMs = frameStartMs + durationMs;
    if (safeElapsedMs < frameEndMs || index === frameDurationsMs.length - 1) {
      return {
        index,
        progress: Math.min(1, Math.max(0, (safeElapsedMs - frameStartMs) / durationMs)),
      };
    }
    frameStartMs = frameEndMs;
  }
  return { index: frameDurationsMs.length - 1, progress: 1 };
}

export async function generateStackVideo(
  board: StackVideoBoard,
  ratio: StackVideoRatio,
  onProgress?: (progress: number) => void,
  backgroundAudio?: StackVideoBackgroundAudio | null,
  narration?: StackVideoNarration | null,
): Promise<StackVideoResult> {
  if (typeof document === 'undefined' || typeof MediaRecorder === 'undefined') {
    throw new Error('Video export is not supported in this browser.');
  }
  if (narration && !stackVideoNarrationIsComplete(board.cards.length, narration)) {
    throw new Error('Full narration is incomplete. No video was created; try again so every selected card can be narrated.');
  }

  const hasNarration = narration?.cardAudioUrls.some(Boolean) ?? false;
  const mimeType = preferredRecorderMimeType(!!backgroundAudio?.url || hasNarration);
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
    loadCachedImage(normalizeStackVideoClosingScreen(board.closingScreen).customImageUrl),
    ...board.cards.map(async (card) => {
      for (const imageUrl of stackVideoCardImageCandidates(card)) {
        if (await loadCachedImage(imageUrl)) return;
      }
    }),
  ]);

  const frames: VideoFrame[] = [
    { kind: 'cover' },
    ...board.cards.map((card) => ({ kind: 'card' as const, card })),
    { kind: 'closing' },
  ];
  const baseFrameDurations = frames.map((frame) => frame.kind === 'closing'
    ? stackVideoClosingDurationMs(board.closingScreen)
    : FRAME_DURATION_MS);
  const preparedAudio = backgroundAudio?.url || hasNarration
    ? await prepareVideoAudio(backgroundAudio, narration, baseFrameDurations)
    : null;
  const frameDurations = preparedAudio?.frameDurationsMs ?? baseFrameDurations;
  const totalDurationMs = frameDurations.reduce((total, duration) => total + duration, 0);
  const canvasStream = canvas.captureStream(FRAME_RATE);
  const stream = combineStackVideoMediaStream(canvasStream, preparedAudio?.tracks);
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: ratio === 'landscape' ? 3_200_000 : 2_800_000,
    ...(preparedAudio ? { audioBitsPerSecond: 128_000 } : {}),
  });
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size) chunks.push(event.data);
  });

  try {
    renderFrame(context, width, height, board, frames[0], images, 0, 0, frames.length);
    recorder.start(500);
    preparedAudio?.start();
    const timelineStartedAt = performance.now();
    while (true) {
      const elapsedMs = Math.min(totalDurationMs, performance.now() - timelineStartedAt);
      const timing = stackVideoFrameAtElapsed(frameDurations, elapsedMs);
      renderFrame(
        context,
        width,
        height,
        board,
        frames[timing.index],
        images,
        timing.progress,
        timing.index,
        frames.length,
      );
      onProgress?.(Math.min(0.99, elapsedMs / totalDurationMs));
      if (elapsedMs >= totalDurationMs) break;
      await nextVideoTick();
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

export async function generateStackTrailer(
  board: StackVideoBoard,
  ratio: StackVideoRatio,
  onProgress?: (progress: number) => void,
  backgroundAudio?: StackVideoBackgroundAudio | null,
  narration?: StackTrailerNarration | null,
): Promise<StackVideoResult> {
  if (typeof document === 'undefined' || typeof MediaRecorder === 'undefined') {
    throw new Error('Video export is not supported in this browser.');
  }
  if (!board.cards.length) {
    throw new Error('Add at least one card before creating a Board Trailer.');
  }
  if (narration && (!narration.audioUrl.trim() || !narration.script.trim())) {
    throw new Error('The trailer voiceover is incomplete. Please try creating it again.');
  }
  const cards = board.cards.slice(0, 30);
  const hasAudio = !!backgroundAudio?.url || !!narration?.audioUrl;
  const mimeType = preferredRecorderMimeType(hasAudio);
  if (!mimeType) throw new Error('This browser cannot record a social video.');

  const { width, height } = dimensionsForRatio(ratio);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Could not prepare the video canvas.');

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
    ...cards.map(async (card) => {
      for (const imageUrl of stackVideoCardImageCandidates(card)) {
        if (await loadCachedImage(imageUrl)) return;
      }
    }),
  ]);

  const initialPlan = stackTrailerPlan(cards.length);
  const preparedAudio = hasAudio
    ? await prepareTrailerAudio(backgroundAudio, narration, initialPlan)
    : null;
  const frameDurationsMs = preparedAudio?.frameDurationsMs ?? initialPlan.frameDurationsMs;
  const totalDurationMs = frameDurationsMs.reduce((sum, value) => sum + value, 0);
  const frameCount = cards.length + 3;
  const captionChunks = stackTrailerCaptionChunks(narration?.script ?? '');
  const canvasStream = canvas.captureStream(FRAME_RATE);
  const stream = combineStackVideoMediaStream(canvasStream, preparedAudio?.tracks);
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: ratio === 'landscape' ? 3_200_000 : 2_800_000,
    ...(preparedAudio ? { audioBitsPerSecond: 128_000 } : {}),
  });
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size) chunks.push(event.data);
  });

  const renderAt = (elapsedMs: number): void => {
    const timing = stackVideoFrameAtElapsed(frameDurationsMs, elapsedMs);
    const captionProgress = Math.min(0.999, Math.max(0, (elapsedMs - TRAILER_VOICE_LEAD_MS) / Math.max(1, totalDurationMs - 2_000)));
    const caption = captionChunks.length
      ? captionChunks[Math.min(captionChunks.length - 1, Math.floor(captionProgress * captionChunks.length))]
      : '';
    renderTrailerFrame(context, width, height, board, cards, images, timing.index, timing.progress, frameCount, caption);
  };

  try {
    renderAt(0);
    recorder.start(500);
    preparedAudio?.start();
    const startedAt = performance.now();
    while (true) {
      const elapsedMs = Math.min(totalDurationMs, performance.now() - startedAt);
      renderAt(elapsedMs);
      onProgress?.(Math.min(0.99, elapsedMs / totalDurationMs));
      if (elapsedMs >= totalDurationMs) break;
      await nextVideoTick();
    }
    await stopRecorder(recorder);
    onProgress?.(1);
  } finally {
    for (const image of images.values()) image.close();
    for (const track of stream.getTracks()) track.stop();
    for (const track of canvasStream.getTracks()) track.stop();
    await preparedAudio?.close();
  }

  if (!chunks.length) throw new Error('The browser did not produce a video file.');
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

async function prepareVideoAudio(
  backgroundAudio: StackVideoBackgroundAudio | null | undefined,
  narration: StackVideoNarration | null | undefined,
  baseFrameDurationsMs: number[],
): Promise<PreparedVideoAudio> {
  const AudioContextConstructor = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) {
    throw new Error('This browser cannot add narration or music to the video.');
  }

  const context = new AudioContextConstructor();
  let started = false;
  try {
    await context.resume();
    const destination = context.createMediaStreamDestination();
    const voiceBuffers = await Promise.all(
      (narration?.cardAudioUrls ?? []).map((url) => url
        ? loadAudioBuffer(context, url, 'A narrator clip could not be loaded. Try creating the video again.')
        : Promise.resolve(null)),
    );
    const frameDurationsMs = [...baseFrameDurationsMs];
    voiceBuffers.forEach((buffer, cardIndex) => {
      if (!buffer || cardIndex + 1 >= frameDurationsMs.length - 1) return;
      frameDurationsMs[cardIndex + 1] = stackVideoNarrationFrameDurationMs(
        buffer.duration,
        frameDurationsMs[cardIndex + 1],
      );
    });
    const durationSeconds = frameDurationsMs.reduce((total, duration) => total + duration, 0) / 1000;
    const sources: AudioBufferSourceNode[] = [];
    const gains: GainNode[] = [];

    let backgroundSource: AudioBufferSourceNode | null = null;
    let backgroundGain: GainNode | null = null;
    let backgroundVolume = 0;
    if (backgroundAudio?.url) {
      const buffer = await loadAudioBuffer(
        context,
        backgroundAudio.url,
        'The selected background music could not be loaded. Choose another mood and try again.',
      );
      backgroundSource = context.createBufferSource();
      backgroundGain = context.createGain();
      backgroundVolume = Math.min(0.5, Math.max(0, backgroundAudio.volume));
      backgroundSource.buffer = buffer;
      backgroundSource.loop = buffer.duration + 0.05 < durationSeconds;
      backgroundSource.connect(backgroundGain);
      backgroundGain.connect(destination);
      sources.push(backgroundSource);
      gains.push(backgroundGain);
    }

    const voiceGain = context.createGain();
    voiceGain.gain.value = Math.min(1, Math.max(0, narration?.volume ?? 1));
    voiceGain.connect(destination);
    gains.push(voiceGain);
    const voiceSources = voiceBuffers.map((buffer) => {
      if (!buffer) return null;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(voiceGain);
      sources.push(source);
      return source;
    });

    return {
      tracks: destination.stream.getAudioTracks(),
      frameDurationsMs,
      start: () => {
        const now = context.currentTime;
        if (backgroundSource && backgroundGain) {
          const fadeInSeconds = Math.min(0.7, Math.max(0.15, durationSeconds / 4));
          const fadeOutSeconds = Math.min(1.2, Math.max(0.2, durationSeconds / 4));
          const fadeOutAt = now + Math.max(fadeInSeconds, durationSeconds - fadeOutSeconds);
          backgroundGain.gain.cancelScheduledValues(now);
          backgroundGain.gain.setValueAtTime(0.0001, now);
          backgroundGain.gain.linearRampToValueAtTime(backgroundVolume, now + fadeInSeconds);
          let frameStartSeconds = frameDurationsMs[0] / 1000;
          voiceBuffers.forEach((buffer, cardIndex) => {
            if (buffer) {
              const duckAt = now + Math.max(fadeInSeconds, frameStartSeconds - 0.16);
              const speechAt = now + frameStartSeconds + 0.1;
              const speechDuration = narrationPlaybackDurationSeconds(buffer, frameDurationsMs[cardIndex + 1]);
              const restoreAt = speechAt + speechDuration + 0.18;
              backgroundGain!.gain.setValueAtTime(backgroundVolume, duckAt);
              backgroundGain!.gain.linearRampToValueAtTime(backgroundVolume * 0.28, speechAt);
              backgroundGain!.gain.setValueAtTime(backgroundVolume * 0.28, speechAt + speechDuration);
              backgroundGain!.gain.linearRampToValueAtTime(backgroundVolume, restoreAt);
            }
            frameStartSeconds += frameDurationsMs[cardIndex + 1] / 1000;
          });
          backgroundGain.gain.setValueAtTime(backgroundVolume, fadeOutAt);
          backgroundGain.gain.linearRampToValueAtTime(0.0001, now + durationSeconds);
          backgroundSource.start(now);
        }
        let frameStartSeconds = frameDurationsMs[0] / 1000;
        voiceSources.forEach((source, cardIndex) => {
          const buffer = voiceBuffers[cardIndex];
          if (source && buffer) {
            source.start(
              now + frameStartSeconds + NARRATION_LEAD_MS / 1000,
              0,
              narrationPlaybackDurationSeconds(buffer, frameDurationsMs[cardIndex + 1]),
            );
          }
          frameStartSeconds += frameDurationsMs[cardIndex + 1] / 1000;
        });
        started = true;
      },
      close: async () => {
        if (started) {
          for (const source of sources) {
            try {
              source.stop();
            } catch {
              // The source already ended with the recording.
            }
          }
        }
        sources.forEach((source) => source.disconnect());
        gains.forEach((gain) => gain.disconnect());
        destination.disconnect();
        await context.close();
      },
    };
  } catch (error) {
    await context.close();
    if (error instanceof Error && error.message) throw error;
    throw new Error('The video audio could not be prepared.');
  }
}

async function prepareTrailerAudio(
  backgroundAudio: StackVideoBackgroundAudio | null | undefined,
  narration: StackTrailerNarration | null | undefined,
  initialPlan: StackTrailerPlan,
): Promise<PreparedTrailerAudio> {
  const AudioContextConstructor = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) throw new Error('This browser cannot add narration or music to the trailer.');

  const context = new AudioContextConstructor();
  let started = false;
  try {
    await context.resume();
    const destination = context.createMediaStreamDestination();
    const voiceBuffer = narration?.audioUrl
      ? await loadAudioBuffer(context, narration.audioUrl, 'The trailer voiceover could not be loaded. Please try again.')
      : null;
    const plan = stackTrailerPlan(initialPlan.frameDurationsMs.length - 3, voiceBuffer?.duration ?? 0);
    const durationSeconds = plan.durationMs / 1000;
    const sources: AudioBufferSourceNode[] = [];
    const gains: GainNode[] = [];

    let backgroundSource: AudioBufferSourceNode | null = null;
    let backgroundGain: GainNode | null = null;
    const backgroundVolume = Math.min(0.5, Math.max(0, backgroundAudio?.volume ?? 0));
    if (backgroundAudio?.url) {
      const buffer = await loadAudioBuffer(
        context,
        backgroundAudio.url,
        'The selected background music could not be loaded. Choose another mood and try again.',
      );
      backgroundSource = context.createBufferSource();
      backgroundGain = context.createGain();
      backgroundSource.buffer = buffer;
      backgroundSource.loop = buffer.duration + 0.05 < durationSeconds;
      backgroundSource.connect(backgroundGain);
      backgroundGain.connect(destination);
      sources.push(backgroundSource);
      gains.push(backgroundGain);
    }

    let voiceSource: AudioBufferSourceNode | null = null;
    let voiceGain: GainNode | null = null;
    if (voiceBuffer) {
      voiceSource = context.createBufferSource();
      voiceGain = context.createGain();
      voiceSource.buffer = voiceBuffer;
      voiceGain.gain.value = Math.min(1, Math.max(0, narration?.volume ?? 1));
      voiceSource.connect(voiceGain);
      voiceGain.connect(destination);
      sources.push(voiceSource);
      gains.push(voiceGain);
    }

    return {
      tracks: destination.stream.getAudioTracks(),
      frameDurationsMs: plan.frameDurationsMs,
      start: () => {
        const now = context.currentTime;
        const voiceDuration = Math.min(
          voiceBuffer?.duration ?? 0,
          Math.max(0, durationSeconds - TRAILER_VOICE_LEAD_MS / 1000 - 0.55),
        );
        if (backgroundSource && backgroundGain) {
          const voiceStartsAt = now + TRAILER_VOICE_LEAD_MS / 1000;
          const voiceEndsAt = voiceStartsAt + voiceDuration;
          backgroundGain.gain.cancelScheduledValues(now);
          backgroundGain.gain.setValueAtTime(0.0001, now);
          backgroundGain.gain.linearRampToValueAtTime(backgroundVolume, now + 0.45);
          if (voiceDuration > 0) {
            backgroundGain.gain.linearRampToValueAtTime(backgroundVolume * 0.24, voiceStartsAt);
            backgroundGain.gain.setValueAtTime(backgroundVolume * 0.24, voiceEndsAt);
            backgroundGain.gain.linearRampToValueAtTime(backgroundVolume, voiceEndsAt + 0.35);
          }
          backgroundGain.gain.setValueAtTime(backgroundVolume, now + Math.max(0.6, durationSeconds - 1.15));
          backgroundGain.gain.linearRampToValueAtTime(0.0001, now + durationSeconds);
          backgroundSource.start(now);
        }
        if (voiceSource && voiceDuration > 0) {
          voiceSource.start(now + TRAILER_VOICE_LEAD_MS / 1000, 0, voiceDuration);
        }
        started = true;
      },
      close: async () => {
        if (started) {
          for (const source of sources) {
            try {
              source.stop();
            } catch {
              // Source already ended with the recording.
            }
          }
        }
        sources.forEach((source) => source.disconnect());
        gains.forEach((gain) => gain.disconnect());
        destination.disconnect();
        await context.close();
      },
    };
  } catch (error) {
    await context.close();
    if (error instanceof Error && error.message) throw error;
    throw new Error('The trailer audio could not be prepared.');
  }
}

async function loadAudioBuffer(
  context: AudioContext,
  url: string,
  errorMessage: string,
): Promise<AudioBuffer> {
  const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!response.ok) throw new Error(errorMessage);
  try {
    return await context.decodeAudioData(await response.arrayBuffer());
  } catch {
    throw new Error(errorMessage);
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
      firstLoadedCardImage(frame.card, images),
      progress,
    );
  } else {
    const closing = normalizeStackVideoClosingScreen(board.closingScreen, board.title);
    const finalCard = board.cards[board.cards.length - 1];
    const closingImage = closing.image === 'custom'
      ? images.get(closing.customImageUrl) ?? images.get(board.coverImageUrl)
      : closing.image === 'final-card' && finalCard
        ? firstLoadedCardImage(finalCard, images) ?? images.get(board.coverImageUrl)
        : images.get(board.coverImageUrl);
    drawClosingFrame(
      context,
      width,
      height,
      board,
      closing,
      closingImage,
      closing.showQrCode ? images.get(board.qrImageUrl) : undefined,
      progress,
    );
  }
  drawTimeline(context, width, height, frameIndex, frameCount, progress);
  context.restore();
}

function renderTrailerFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  board: StackVideoBoard,
  cards: StackVideoCard[],
  images: Map<string, LoadedImage>,
  frameIndex: number,
  progress: number,
  frameCount: number,
  caption: string,
): void {
  context.save();
  context.clearRect(0, 0, width, height);
  drawBackdrop(context, width, height);
  if (frameIndex === 0) {
    drawTrailerCoverFrame(context, width, height, board, images.get(board.coverImageUrl), progress);
  } else if (frameIndex <= cards.length) {
    const cardIndex = frameIndex - 1;
    drawTrailerCardFrame(
      context,
      width,
      height,
      cards[cardIndex],
      cardIndex,
      cards.length,
      firstLoadedCardImage(cards[cardIndex], images),
      progress,
    );
  } else if (frameIndex === cards.length + 1) {
    drawTrailerMontageFrame(context, width, height, cards, images, progress);
  } else {
    drawTrailerClosingFrame(context, width, height, board, progress);
  }
  if (caption && frameIndex > 0 && frameIndex < frameCount - 1) {
    drawTrailerCaption(context, width, height, caption);
  }
  drawTrailerTimeline(context, width, height, frameIndex, frameCount, progress);
  context.restore();
}

function drawTrailerCoverFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  board: StackVideoBoard,
  image: LoadedImage | undefined,
  progress: number,
): void {
  if (isLandscapeFrame(width, height)) {
    drawLandscapeCoverFrame(context, width, height, board, image, progress, true);
    return;
  }
  if (image) drawCoverImage(context, image, width, height, 1.04 + progress * 0.035);
  drawShade(context, width, height, image ? 0.88 : 0.4);
  drawBrandPill(context, width, height);
  const padding = width * 0.075;
  const reveal = easeOut(Math.min(1, progress * 3.2));
  context.save();
  context.globalAlpha = reveal;
  context.translate(0, (1 - reveal) * height * 0.04);
  context.fillStyle = '#bdfbe3';
  context.font = `900 ${Math.round(width * 0.032)}px Inter, Arial, sans-serif`;
  context.letterSpacing = `${Math.round(width * 0.004)}px`;
  context.fillText('A BOARD WORTH OPENING', padding, height * 0.56);
  context.letterSpacing = '0px';
  context.fillStyle = '#ffffff';
  context.font = `950 ${Math.round(width * 0.105)}px Inter, Arial, sans-serif`;
  drawWrappedText(context, board.title, padding, height * 0.62, width - padding * 2, width * 0.108, 3);
  context.fillStyle = 'rgba(255,255,255,.82)';
  context.font = `800 ${Math.round(width * 0.034)}px Inter, Arial, sans-serif`;
  context.fillText(`${board.cards.length} cards · one LivingWiki`, padding, height * 0.9);
  context.restore();
}

function drawTrailerCardFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  card: StackVideoCard,
  cardIndex: number,
  cardCount: number,
  image: LoadedImage | undefined,
  progress: number,
): void {
  if (isLandscapeFrame(width, height)) {
    drawLandscapeCardFrame(context, width, height, card, image, progress, cardIndex, cardCount);
    return;
  }
  if (image) drawCoverImage(context, image, width, height, 1.06 + progress * 0.045);
  drawShade(context, width, height, image ? 0.82 : 0.36);
  drawBrandPill(context, width, height);
  const padding = width * 0.075;
  const reveal = easeOut(Math.min(1, progress * 4));
  context.save();
  context.globalAlpha = reveal;
  context.translate((1 - reveal) * width * 0.045, 0);
  context.fillStyle = '#bdfbe3';
  context.font = `900 ${Math.round(width * 0.029)}px Inter, Arial, sans-serif`;
  context.fillText(`${String(cardIndex + 1).padStart(2, '0')} / ${String(cardCount).padStart(2, '0')}`, padding, height * 0.61);
  context.fillStyle = '#ffffff';
  context.font = `950 ${Math.round(width * 0.09)}px Inter, Arial, sans-serif`;
  drawWrappedText(context, card.title, padding, height * 0.67, width - padding * 2, width * 0.094, 3);
  context.restore();
}

function drawTrailerMontageFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  cards: StackVideoCard[],
  images: Map<string, LoadedImage>,
  progress: number,
): void {
  if (isLandscapeFrame(width, height)) {
    drawLandscapeTrailerMontageFrame(context, width, height, cards, images, progress);
    return;
  }
  const columns = 3;
  const rows = 3;
  const gap = width * 0.018;
  const padding = width * 0.045;
  const tileWidth = (width - padding * 2 - gap * (columns - 1)) / columns;
  const tileHeight = height * 0.205;
  const startY = height * 0.12;
  const montageCards = cards.slice(0, 9);
  montageCards.forEach((card, index) => {
    const image = firstLoadedCardImage(card, images);
    const x = padding + (index % columns) * (tileWidth + gap);
    const y = startY + Math.floor(index / columns) * (tileHeight + gap);
    context.save();
    context.globalAlpha = easeOut(Math.min(1, progress * 3 - index * 0.08));
    roundedRect(context, x, y, tileWidth, tileHeight, width * 0.025);
    context.clip();
    if (image) drawImageCoverIntoRect(context, image, x, y, tileWidth, tileHeight, 1.04);
    else {
      context.fillStyle = index % 2 ? '#144738' : '#0c6b54';
      context.fillRect(x, y, tileWidth, tileHeight);
    }
    context.restore();
  });
  const gradient = context.createLinearGradient(0, height * 0.56, 0, height);
  gradient.addColorStop(0, 'rgba(7,16,13,0)');
  gradient.addColorStop(0.28, 'rgba(7,16,13,.86)');
  gradient.addColorStop(1, '#07100d');
  context.fillStyle = gradient;
  context.fillRect(0, height * 0.53, width, height * 0.47);
  context.textAlign = 'center';
  context.fillStyle = '#bdfbe3';
  context.font = `900 ${Math.round(width * 0.032)}px Inter, Arial, sans-serif`;
  context.fillText('THE WHOLE BOARD IS WAITING', width / 2, height * 0.78);
  context.fillStyle = '#ffffff';
  context.font = `950 ${Math.round(width * 0.088)}px Inter, Arial, sans-serif`;
  context.fillText(`${cards.length} CARDS`, width / 2, height * 0.86);
  context.textAlign = 'left';
}

function drawTrailerClosingFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  board: StackVideoBoard,
  progress: number,
): void {
  if (isLandscapeFrame(width, height)) {
    drawLandscapeTrailerClosingFrame(context, width, height, board, progress);
    return;
  }
  const reveal = easeOut(Math.min(1, progress * 2.8));
  context.save();
  context.globalAlpha = reveal;
  context.translate(0, (1 - reveal) * height * 0.03);
  context.textAlign = 'center';
  context.fillStyle = '#bdfbe3';
  context.font = `900 ${Math.round(width * 0.034)}px Inter, Arial, sans-serif`;
  context.fillText('THERE IS MORE TO DISCOVER', width / 2, height * 0.31);
  context.fillStyle = '#ffffff';
  context.font = `950 ${Math.round(width * 0.086)}px Inter, Arial, sans-serif`;
  drawWrappedText(context, 'OPEN THE FULL BOARD', width * 0.085, height * 0.39, width * 0.83, width * 0.092, 3, 'center');
  roundedRect(context, width * 0.14, height * 0.665, width * 0.72, height * 0.086, 999);
  context.fillStyle = '#bdfbe3';
  context.fill();
  context.fillStyle = '#08271e';
  context.font = `950 ${Math.round(width * 0.031)}px Inter, Arial, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('EXPLORE ON LIVINGWIKI', width / 2, height * 0.708);
  context.textBaseline = 'alphabetic';
  context.fillStyle = 'rgba(255,255,255,.72)';
  context.font = `800 ${Math.round(width * 0.025)}px Inter, Arial, sans-serif`;
  context.fillText(displayUrlHost(board.liveUrl), width / 2, height * 0.855);
  context.restore();
}

function drawTrailerCaption(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  caption: string,
): void {
  if (isLandscapeFrame(width, height)) {
    const padding = width * 0.12;
    const boxHeight = height * 0.13;
    const y = height - boxHeight - height * 0.035;
    roundedRect(context, padding, y, width - padding * 2, boxHeight, height * 0.035);
    context.fillStyle = 'rgba(4,18,14,.9)';
    context.fill();
    context.strokeStyle = 'rgba(189,251,227,.42)';
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = '#ffffff';
    context.font = `850 ${Math.round(height * 0.041)}px Inter, Arial, sans-serif`;
    context.textAlign = 'center';
    drawWrappedText(
      context,
      caption,
      padding + height * 0.04,
      y + height * 0.055,
      width - padding * 2 - height * 0.08,
      height * 0.045,
      2,
      'center',
    );
    context.textAlign = 'left';
    return;
  }
  const padding = width * 0.08;
  const y = height * 0.87;
  roundedRect(context, padding, y, width - padding * 2, height * 0.085, width * 0.025);
  context.fillStyle = 'rgba(4,18,14,.84)';
  context.fill();
  context.strokeStyle = 'rgba(189,251,227,.42)';
  context.lineWidth = 2;
  context.stroke();
  context.fillStyle = '#ffffff';
  context.font = `850 ${Math.round(width * 0.031)}px Inter, Arial, sans-serif`;
  context.textAlign = 'center';
  drawWrappedText(context, caption, padding + width * 0.025, y + height * 0.033, width - padding * 2 - width * 0.05, width * 0.039, 2, 'center');
  context.textAlign = 'left';
}

function drawTrailerTimeline(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  activeIndex: number,
  count: number,
  progress: number,
): void {
  const padding = width * 0.065;
  const totalProgress = Math.min(1, Math.max(0, (activeIndex + progress) / count));
  roundedRect(context, padding, height * 0.025, width - padding * 2, Math.max(5, width * 0.009), 999);
  context.fillStyle = 'rgba(255,255,255,.25)';
  context.fill();
  roundedRect(context, padding, height * 0.025, (width - padding * 2) * totalProgress, Math.max(5, width * 0.009), 999);
  context.fillStyle = '#bdfbe3';
  context.fill();
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
  if (isLandscapeFrame(width, height)) {
    drawLandscapeCoverFrame(context, width, height, board, image, progress, false);
    return;
  }
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
  image: LoadedImage | undefined,
  progress: number,
): void {
  if (isLandscapeFrame(width, height)) {
    drawLandscapeCardFrame(context, width, height, card, image, progress);
    return;
  }
  if (image) drawCoverImage(context, image, width, height, 1.02 + progress * 0.03);
  drawShade(context, width, height, image ? 0.86 : 0.38);
  drawBrandPill(context, width, height);
  const padding = width * 0.075;
  const reveal = easeOut(Math.min(1, progress * 3));
  context.save();
  context.globalAlpha = reveal;
  context.translate(0, (1 - reveal) * height * 0.035);
  const [title] = stackVideoCardVisibleText(card);
  context.fillStyle = '#ffffff';
  context.font = `950 ${Math.round(width * 0.09)}px Inter, Arial, sans-serif`;
  drawWrappedText(context, title, padding, height * 0.64, width - padding * 2, width * 0.095, 3);
  context.restore();
}

function drawClosingFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  board: StackVideoBoard,
  closing: StackVideoClosingScreen,
  image: LoadedImage | undefined,
  qrImage: LoadedImage | undefined,
  progress: number,
): void {
  if (isLandscapeFrame(width, height)) {
    drawLandscapeClosingFrame(context, width, height, board, closing, image, qrImage, progress);
    return;
  }
  if (image) drawCoverImage(context, image, width, height, 1.03 + progress * 0.025);
  drawShade(context, width, height, image ? 0.9 : 0.4);
  const reveal = easeOut(Math.min(1, progress * 2.5));
  context.save();
  context.globalAlpha = reveal;
  context.translate(0, (1 - reveal) * height * 0.025);
  context.textAlign = 'center';
  context.fillStyle = '#bdfbe3';
  context.font = `850 ${Math.round(width * 0.034)}px Inter, Arial, sans-serif`;
  drawWrappedText(context, closing.headline.toUpperCase(), width * 0.1, height * 0.2, width * 0.8, width * 0.044, 2, 'center');
  context.fillStyle = '#ffffff';
  context.font = `950 ${Math.round(width * 0.072)}px Inter, Arial, sans-serif`;
  drawWrappedText(context, closing.message || board.title, width * 0.09, height * 0.3, width * 0.82, width * 0.078, 3, 'center');
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
  context.fillStyle = '#ffffff';
  context.font = `900 ${Math.round(width * 0.027)}px Inter, Arial, sans-serif`;
  context.fillText(STACK_VIDEO_BRAND_URL, width / 2, height * 0.93);
  context.restore();
}

function drawLandscapeCoverFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  board: StackVideoBoard,
  image: LoadedImage | undefined,
  progress: number,
  trailer: boolean,
): void {
  const layout = stackVideoLandscapeLayout(width, height);
  drawLandscapeImageScene(context, width, height, layout.image, image);
  drawLandscapeBrandPill(context, layout.content, height);
  const reveal = easeOut(Math.min(1, progress * (trailer ? 3.2 : 2.8)));
  context.save();
  context.globalAlpha = reveal;
  context.translate((1 - reveal) * height * 0.035, 0);
  context.fillStyle = '#bdfbe3';
  context.font = `900 ${Math.round(height * 0.035)}px Inter, Arial, sans-serif`;
  context.letterSpacing = `${Math.round(height * 0.004)}px`;
  context.fillText(
    trailer ? 'A BOARD WORTH OPENING' : 'A LIVINGWIKI STACK',
    layout.content.x,
    layout.content.y + height * 0.18,
  );
  context.letterSpacing = '0px';
  context.fillStyle = '#ffffff';
  context.font = `950 ${Math.round(height * 0.073)}px Inter, Arial, sans-serif`;
  const titleBottom = drawWrappedText(
    context,
    board.title,
    layout.content.x,
    layout.content.y + height * 0.265,
    layout.content.width,
    height * 0.081,
    4,
  );
  if (!trailer && board.subtitle.trim()) {
    context.fillStyle = 'rgba(255,255,255,.8)';
    context.font = `750 ${Math.round(height * 0.034)}px Inter, Arial, sans-serif`;
    drawWrappedText(
      context,
      board.subtitle,
      layout.content.x,
      Math.min(titleBottom + height * 0.07, layout.content.y + height * 0.61),
      layout.content.width,
      height * 0.045,
      2,
    );
  }
  context.fillStyle = 'rgba(255,255,255,.78)';
  context.font = `800 ${Math.round(height * 0.029)}px Inter, Arial, sans-serif`;
  const cardLabel = `${board.cards.length} ${board.cards.length === 1 ? 'card' : 'cards'}`;
  context.fillText(
    `${cardLabel}${trailer ? ' · one LivingWiki' : ''}`,
    layout.content.x,
    layout.content.y + layout.content.height - height * 0.035,
  );
  context.restore();
}

function drawLandscapeCardFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  card: StackVideoCard,
  image: LoadedImage | undefined,
  progress: number,
  cardIndex?: number,
  cardCount?: number,
): void {
  const layout = stackVideoLandscapeLayout(width, height);
  drawLandscapeImageScene(context, width, height, layout.image, image);
  drawLandscapeBrandPill(context, layout.content, height);
  const reveal = easeOut(Math.min(1, progress * 3.5));
  context.save();
  context.globalAlpha = reveal;
  context.translate((1 - reveal) * height * 0.04, 0);
  if (cardIndex !== undefined && cardCount !== undefined) {
    context.fillStyle = '#bdfbe3';
    context.font = `900 ${Math.round(height * 0.038)}px Inter, Arial, sans-serif`;
    context.fillText(
      `${String(cardIndex + 1).padStart(2, '0')} / ${String(cardCount).padStart(2, '0')}`,
      layout.content.x,
      layout.content.y + height * 0.2,
    );
  }
  const [title] = stackVideoCardVisibleText(card);
  context.fillStyle = '#ffffff';
  context.font = `950 ${Math.round(height * 0.083)}px Inter, Arial, sans-serif`;
  drawWrappedText(
    context,
    title,
    layout.content.x,
    layout.content.y + height * (cardIndex === undefined ? 0.34 : 0.29),
    layout.content.width,
    height * 0.093,
    4,
  );
  context.restore();
}

function drawLandscapeClosingFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  board: StackVideoBoard,
  closing: StackVideoClosingScreen,
  image: LoadedImage | undefined,
  qrImage: LoadedImage | undefined,
  progress: number,
): void {
  const layout = stackVideoLandscapeLayout(width, height);
  drawLandscapeImageScene(context, width, height, layout.image, image);
  drawLandscapeBrandPill(context, layout.content, height);
  const reveal = easeOut(Math.min(1, progress * 2.5));
  context.save();
  context.globalAlpha = reveal;
  context.translate((1 - reveal) * height * 0.03, 0);
  context.fillStyle = '#bdfbe3';
  context.font = `850 ${Math.round(height * 0.033)}px Inter, Arial, sans-serif`;
  drawWrappedText(
    context,
    closing.headline.toUpperCase(),
    layout.content.x,
    layout.content.y + height * 0.18,
    layout.content.width,
    height * 0.042,
    2,
  );
  context.fillStyle = '#ffffff';
  context.font = `950 ${Math.round(height * 0.064)}px Inter, Arial, sans-serif`;
  drawWrappedText(
    context,
    closing.message || board.title,
    layout.content.x,
    layout.content.y + height * 0.27,
    layout.content.width,
    height * 0.071,
    3,
  );
  if (qrImage) {
    const qrSize = height * 0.19;
    const x = layout.content.x;
    const y = layout.content.y + height * 0.54;
    roundedRect(context, x - 8, y - 8, qrSize + 16, qrSize + 16, 16);
    context.fillStyle = '#ffffff';
    context.fill();
    context.drawImage(qrImage.source, x, y, qrSize, qrSize);
  }
  context.fillStyle = 'rgba(255,255,255,.7)';
  context.font = `750 ${Math.round(height * 0.025)}px Inter, Arial, sans-serif`;
  context.fillText('Made with LivingWiki', layout.content.x, layout.content.y + layout.content.height - height * 0.07);
  context.fillStyle = '#ffffff';
  context.font = `900 ${Math.round(height * 0.026)}px Inter, Arial, sans-serif`;
  context.fillText(STACK_VIDEO_BRAND_URL, layout.content.x, layout.content.y + layout.content.height - height * 0.03);
  context.restore();
}

function drawLandscapeTrailerMontageFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  cards: StackVideoCard[],
  images: Map<string, LoadedImage>,
  progress: number,
): void {
  const columns = 4;
  const gap = height * 0.025;
  const padding = height * 0.075;
  const tileWidth = (width - padding * 2 - gap * (columns - 1)) / columns;
  const tileHeight = height * 0.205;
  const startY = height * 0.095;
  cards.slice(0, 12).forEach((card, index) => {
    const image = firstLoadedCardImage(card, images);
    const x = padding + (index % columns) * (tileWidth + gap);
    const y = startY + Math.floor(index / columns) * (tileHeight + gap);
    context.save();
    context.globalAlpha = easeOut(Math.min(1, progress * 3 - index * 0.06));
    roundedRect(context, x, y, tileWidth, tileHeight, height * 0.025);
    context.clip();
    if (image) {
      context.globalAlpha *= 0.42;
      drawImageCoverIntoRect(context, image, x, y, tileWidth, tileHeight, 1.02);
      context.globalAlpha = easeOut(Math.min(1, progress * 3 - index * 0.06));
      context.fillStyle = 'rgba(4,18,14,.38)';
      context.fillRect(x, y, tileWidth, tileHeight);
      drawImageContainIntoRect(context, image, x + 6, y + 6, tileWidth - 12, tileHeight - 12);
    } else {
      context.fillStyle = index % 2 ? '#144738' : '#0c6b54';
      context.fillRect(x, y, tileWidth, tileHeight);
    }
    context.restore();
  });
  const gradient = context.createLinearGradient(0, height * 0.55, 0, height);
  gradient.addColorStop(0, 'rgba(7,16,13,0)');
  gradient.addColorStop(0.3, 'rgba(7,16,13,.88)');
  gradient.addColorStop(1, '#07100d');
  context.fillStyle = gradient;
  context.fillRect(0, height * 0.53, width, height * 0.47);
  context.textAlign = 'center';
  context.fillStyle = '#bdfbe3';
  context.font = `900 ${Math.round(height * 0.037)}px Inter, Arial, sans-serif`;
  context.fillText('THE WHOLE BOARD IS WAITING', width / 2, height * 0.79);
  context.fillStyle = '#ffffff';
  context.font = `950 ${Math.round(height * 0.085)}px Inter, Arial, sans-serif`;
  context.fillText(`${cards.length} CARDS`, width / 2, height * 0.88);
  context.textAlign = 'left';
}

function drawLandscapeTrailerClosingFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  board: StackVideoBoard,
  progress: number,
): void {
  const reveal = easeOut(Math.min(1, progress * 2.8));
  context.save();
  context.globalAlpha = reveal;
  context.translate(0, (1 - reveal) * height * 0.03);
  context.textAlign = 'center';
  context.fillStyle = '#bdfbe3';
  context.font = `900 ${Math.round(height * 0.038)}px Inter, Arial, sans-serif`;
  context.fillText('THERE IS MORE TO DISCOVER', width / 2, height * 0.28);
  context.fillStyle = '#ffffff';
  context.font = `950 ${Math.round(height * 0.09)}px Inter, Arial, sans-serif`;
  drawWrappedText(context, 'OPEN THE FULL BOARD', width * 0.12, height * 0.39, width * 0.76, height * 0.1, 2, 'center');
  roundedRect(context, width * 0.28, height * 0.62, width * 0.44, height * 0.1, 999);
  context.fillStyle = '#bdfbe3';
  context.fill();
  context.fillStyle = '#08271e';
  context.font = `950 ${Math.round(height * 0.035)}px Inter, Arial, sans-serif`;
  context.textBaseline = 'middle';
  context.fillText('EXPLORE ON LIVINGWIKI', width / 2, height * 0.67);
  context.textBaseline = 'alphabetic';
  context.fillStyle = 'rgba(255,255,255,.72)';
  context.font = `800 ${Math.round(height * 0.029)}px Inter, Arial, sans-serif`;
  context.fillText(displayUrlHost(board.liveUrl), width / 2, height * 0.83);
  context.restore();
}

function drawLandscapeImageScene(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  imageRect: StackVideoRect,
  image: LoadedImage | undefined,
): void {
  if (image) {
    context.save();
    context.globalAlpha = 0.48;
    context.filter = `blur(${Math.round(height * 0.025)}px)`;
    drawCoverImage(context, image, width, height, 1.04);
    context.restore();
  }
  const wash = context.createLinearGradient(0, 0, width, 0);
  wash.addColorStop(0, 'rgba(4,18,14,.4)');
  wash.addColorStop(0.58, 'rgba(4,18,14,.72)');
  wash.addColorStop(1, 'rgba(4,18,14,.96)');
  context.fillStyle = wash;
  context.fillRect(0, 0, width, height);

  context.save();
  context.shadowColor = 'rgba(0,0,0,.4)';
  context.shadowBlur = height * 0.035;
  context.shadowOffsetY = height * 0.015;
  roundedRect(context, imageRect.x, imageRect.y, imageRect.width, imageRect.height, height * 0.035);
  context.fillStyle = '#07100d';
  context.fill();
  context.restore();

  context.save();
  roundedRect(context, imageRect.x, imageRect.y, imageRect.width, imageRect.height, height * 0.035);
  context.clip();
  if (image) {
    context.globalAlpha = 0.32;
    drawImageCoverIntoRect(context, image, imageRect.x, imageRect.y, imageRect.width, imageRect.height, 1.02);
    context.globalAlpha = 1;
    context.fillStyle = 'rgba(4,18,14,.38)';
    context.fillRect(imageRect.x, imageRect.y, imageRect.width, imageRect.height);
    const inset = height * 0.017;
    drawImageContainIntoRect(
      context,
      image,
      imageRect.x + inset,
      imageRect.y + inset,
      imageRect.width - inset * 2,
      imageRect.height - inset * 2,
    );
  } else {
    const placeholder = context.createLinearGradient(imageRect.x, imageRect.y, imageRect.x + imageRect.width, imageRect.y + imageRect.height);
    placeholder.addColorStop(0, '#0c6b54');
    placeholder.addColorStop(1, '#10251d');
    context.fillStyle = placeholder;
    context.fillRect(imageRect.x, imageRect.y, imageRect.width, imageRect.height);
  }
  context.restore();
  roundedRect(context, imageRect.x, imageRect.y, imageRect.width, imageRect.height, height * 0.035);
  context.strokeStyle = 'rgba(255,255,255,.32)';
  context.lineWidth = 2;
  context.stroke();
}

function drawLandscapeBrandPill(
  context: CanvasRenderingContext2D,
  contentRect: StackVideoRect,
  height: number,
): void {
  const pillHeight = height * 0.062;
  const pillWidth = Math.min(contentRect.width, height * 0.31);
  roundedRect(context, contentRect.x, contentRect.y, pillWidth, pillHeight, pillHeight / 2);
  context.fillStyle = 'rgba(4,18,14,.7)';
  context.fill();
  context.strokeStyle = 'rgba(255,255,255,.4)';
  context.lineWidth = 2;
  context.stroke();
  context.fillStyle = '#ffffff';
  context.font = `900 ${Math.round(height * 0.027)}px Inter, Arial, sans-serif`;
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillText('◈  LivingWiki', contentRect.x + pillHeight * 0.34, contentRect.y + pillHeight / 2);
  context.textBaseline = 'alphabetic';
}

function isLandscapeFrame(width: number, height: number): boolean {
  return width / height >= 1.5;
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

function drawImageCoverIntoRect(
  context: CanvasRenderingContext2D,
  image: LoadedImage,
  x: number,
  y: number,
  width: number,
  height: number,
  scale = 1,
): void {
  const targetRatio = width / height;
  const imageRatio = image.width / image.height;
  let sourceWidth = image.width;
  let sourceHeight = image.height;
  if (imageRatio > targetRatio) sourceWidth = image.height * targetRatio;
  else sourceHeight = image.width / targetRatio;
  sourceWidth /= scale;
  sourceHeight /= scale;
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

function drawImageContainIntoRect(
  context: CanvasRenderingContext2D,
  image: LoadedImage,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const destination = stackVideoContainRect(image.width, image.height, { x, y, width, height });
  context.drawImage(
    image.source,
    0,
    0,
    image.width,
    image.height,
    destination.x,
    destination.y,
    destination.width,
    destination.height,
  );
}

function drawShade(context: CanvasRenderingContext2D, width: number, height: number, strength: number): void {
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, `rgba(0,0,0,${strength * 0.26})`);
  gradient.addColorStop(0.42, `rgba(0,0,0,${strength * 0.16})`);
  gradient.addColorStop(1, `rgba(0,0,0,${strength})`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
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
  const previousAlign = context.textAlign;
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = context.measureText(word).width > maxWidth
        ? truncateCanvasText(context, word, maxWidth)
        : word;
      if (lines.length === maxLines) break;
    } else {
      line = !line && context.measureText(candidate).width > maxWidth
        ? truncateCanvasText(context, candidate, maxWidth)
        : candidate;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = truncateCanvasText(context, `${lines[maxLines - 1]}…`, maxWidth);
  }
  context.textAlign = align;
  const drawX = align === 'center' ? x + maxWidth / 2 : x;
  lines.forEach((value, index) => context.fillText(value, drawX, y + index * lineHeight));
  context.textAlign = previousAlign;
  return y + Math.max(0, lines.length - 1) * lineHeight;
}

function truncateCanvasText(
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
): string {
  const text = value.trim();
  if (!text || context.measureText(text).width <= maxWidth) return text;
  const plain = text.replace(/…+$/, '').trimEnd();
  let low = 0;
  let high = plain.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (context.measureText(`${plain.slice(0, middle).trimEnd()}…`).width <= maxWidth) low = middle;
    else high = middle - 1;
  }
  return `${plain.slice(0, low).trimEnd()}…`;
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

function displayUrlHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return 'livingwiki.com';
  }
}

function easeOut(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}

function narrationPlaybackDurationSeconds(buffer: AudioBuffer, frameDurationMs: number): number {
  const availableMs = Math.max(100, frameDurationMs - NARRATION_LEAD_MS - NARRATION_TAIL_MS);
  return Math.min(buffer.duration, availableMs / 1000);
}

function nextVideoTick(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, Math.round(1000 / FRAME_RATE)));
}

function stopRecorder(recorder: MediaRecorder): Promise<void> {
  return new Promise((resolve, reject) => {
    recorder.addEventListener('stop', () => resolve(), { once: true });
    recorder.addEventListener('error', () => reject(new Error('Video recording failed.')), { once: true });
    recorder.stop();
  });
}
