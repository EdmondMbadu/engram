import { isPlatformBrowser } from '@angular/common';
import { computed, effect, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { FirebaseError } from 'firebase/app';
import { httpsCallable, type Functions } from 'firebase/functions';
import { AuthService } from './auth.service';
import { getFirebaseFunctions } from './firebase.client';

export type SpotifyTrack = {
  uri: string;
  title: string;
  artist: string;
  album: string;
  artworkUrl: string;
  spotifyUrl: string;
  lookupTitle?: string;
  lookupArtist?: string;
  lookupContext?: string;
};

export type SpotifyDevice = {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  isRestricted: boolean;
  volumePercent: number;
};

type SpotifyAccount = {
  accountId: string;
  displayName: string;
  imageUrl: string;
  product: string;
  connectedAt: string;
  refreshExpiresAt: string;
};

type SpotifyConnection = {
  configured: boolean;
  connected: boolean;
  needsReauthorization: boolean;
  account: SpotifyAccount | null;
};

type SpotifySdkTrack = {
  uri?: string;
  name?: string;
  album?: { name?: string; images?: Array<{ url?: string }> };
  artists?: Array<{ name?: string }>;
};

type SpotifySdkState = {
  paused?: boolean;
  position?: number;
  duration?: number;
  track_window?: {
    current_track?: SpotifySdkTrack;
  };
};

type SpotifySdkPlayer = {
  addListener(event: string, callback: (value: any) => void): boolean;
  connect(): Promise<boolean>;
  disconnect(): void;
  activateElement(): Promise<void>;
  togglePlay(): Promise<void>;
  nextTrack(): Promise<void>;
  previousTrack(): Promise<void>;
  seek(positionMs: number): Promise<void>;
};

type SpotifySdkConstructor = new (options: {
  name: string;
  getOAuthToken: (callback: (token: string) => void) => void;
  volume?: number;
  enableMediaSession?: boolean;
}) => SpotifySdkPlayer;

type SpotifySdkWindow = Window & {
  Spotify?: { Player: SpotifySdkConstructor };
  onSpotifyWebPlaybackSDKReady?: () => void;
};

type PendingPlayback = {
  track: SpotifyTrack;
  queue: SpotifyTrack[];
};

const emptyConnection: SpotifyConnection = {
  configured: true,
  connected: false,
  needsReauthorization: false,
  account: null,
};

const pendingPlaybackKey = 'livingwiki.spotify.pending.v1';

@Injectable({ providedIn: 'root' })
export class SpotifyPlaybackService {
  private readonly authService = inject(AuthService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly functions: Functions | null = this.isBrowser ? getFirebaseFunctions() : null;
  private player: SpotifySdkPlayer | null = null;
  private sdkPromise: Promise<void> | null = null;
  private readyPromise: Promise<string> | null = null;
  private resolveReady: ((deviceId: string) => void) | null = null;
  private rejectReady: ((error: Error) => void) | null = null;
  private browserDeviceId = '';
  private lastLoadedUid = '';
  private queue: SpotifyTrack[] = [];
  private progressTimer: number | null = null;

  readonly connection = signal<SpotifyConnection>(emptyConnection);
  readonly connectionLoading = signal(false);
  readonly connectDialogOpen = signal(false);
  readonly connecting = signal(false);
  readonly playerInitializing = signal(false);
  readonly playerReady = signal(false);
  readonly playing = signal(false);
  readonly currentTrack = signal<SpotifyTrack | null>(null);
  readonly embeddedTrack = signal<SpotifyTrack | null>(null);
  readonly positionMs = signal(0);
  readonly durationMs = signal(0);
  readonly devices = signal<SpotifyDevice[]>([]);
  readonly selectedDeviceId = signal('');
  readonly notice = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  readonly signedIn = this.authService.isAuthenticated;
  readonly connected = computed(() => this.connection().connected);
  readonly account = computed(() => this.connection().account);
  readonly needsPremium = computed(() => {
    const product = this.account()?.product.toLowerCase() ?? '';
    return !!product && product !== 'premium';
  });
  readonly signInHref = computed(() => {
    if (!this.isBrowser) {
      return '/sign-in';
    }
    return `/sign-in?redirectTo=${encodeURIComponent(
      `${window.location.pathname}${window.location.search}${window.location.hash}`,
    )}`;
  });

  constructor() {
    if (this.isBrowser) {
      this.readOAuthResult();
      this.startProgressClock();
    }

    effect(() => {
      const initialized = this.authService.initialized();
      const uid = this.authService.uid();
      if (!initialized) {
        return;
      }
      if (!uid) {
        this.lastLoadedUid = '';
        this.resetConnection();
        return;
      }
      if (this.lastLoadedUid === uid) {
        return;
      }
      this.lastLoadedUid = uid;
      void this.loadConnection();
    });
  }

  openConnectionDialog(): void {
    this.error.set(null);
    this.connectDialogOpen.set(true);
    if (this.authService.uid() && !this.connectionLoading()) {
      void this.loadConnection();
    }
  }

  openEmbeddedPlayer(track: SpotifyTrack): void {
    this.error.set(null);
    this.notice.set(null);
    this.embeddedTrack.set(track);
  }

  closeEmbeddedPlayer(): void {
    this.embeddedTrack.set(null);
  }

  isEmbeddedTrack(uri: string): boolean {
    return !!uri && this.embeddedTrack()?.uri === uri;
  }

  closeConnectionDialog(): void {
    this.connectDialogOpen.set(false);
  }

  async loadConnection(): Promise<void> {
    if (!this.functions || !this.authService.uid()) {
      this.resetConnection();
      return;
    }
    this.connectionLoading.set(true);
    try {
      const callable = httpsCallable<Record<string, never>, SpotifyConnection>(
        this.functions,
        'getSpotifyConnection',
      );
      const result = await callable({});
      this.connection.set({
        configured: result.data.configured !== false,
        connected: result.data.connected === true,
        needsReauthorization: result.data.needsReauthorization === true,
        account: result.data.account ?? null,
      });
      if (result.data.connected) {
        this.restorePendingPlayback();
        void this.initializePlayer().catch(() => undefined);
      }
    } catch (error) {
      this.error.set(this.friendlyError(error, $localize`Could not check your Spotify connection.`));
    } finally {
      this.connectionLoading.set(false);
    }
  }

  async connect(): Promise<void> {
    if (!this.functions || !this.authService.uid() || this.connecting()) {
      return;
    }
    this.connecting.set(true);
    this.error.set(null);
    try {
      const callable = httpsCallable<{ returnUrl: string }, { authorizationUrl: string }>(
        this.functions,
        'createSpotifyConnectionUrl',
      );
      const result = await callable({ returnUrl: this.cleanCurrentUrl() });
      const authorizationUrl = result.data.authorizationUrl;
      if (!/^https:\/\/accounts\.spotify\.com\/authorize\?/i.test(authorizationUrl)) {
        throw new Error('Spotify returned an invalid connection address.');
      }
      window.location.assign(authorizationUrl);
    } catch (error) {
      this.connecting.set(false);
      this.error.set(this.friendlyError(error, $localize`Could not start the Spotify connection.`));
    }
  }

  async disconnect(): Promise<void> {
    if (!this.functions || !this.authService.uid() || this.connecting()) {
      return;
    }
    this.connecting.set(true);
    this.error.set(null);
    try {
      const callable = httpsCallable<Record<string, never>, { disconnected: boolean }>(
        this.functions,
        'disconnectSpotify',
      );
      await callable({});
      this.player?.disconnect();
      this.player = null;
      this.browserDeviceId = '';
      this.playerReady.set(false);
      this.currentTrack.set(null);
      this.playing.set(false);
      this.devices.set([]);
      this.selectedDeviceId.set('');
      this.connection.set(emptyConnection);
      this.clearPendingPlayback();
      this.notice.set('Spotify has been disconnected from LivingWiki.');
    } catch (error) {
      this.error.set(this.friendlyError(error, $localize`Could not disconnect Spotify.`));
    } finally {
      this.connecting.set(false);
    }
  }

  async requestPlay(track: SpotifyTrack, queue: SpotifyTrack[] = [track]): Promise<void> {
    this.error.set(null);
    this.notice.set(null);
    this.queue = this.normalizedQueue(track, queue);
    this.currentTrack.set(track);
    this.savePendingPlayback({ track, queue: this.queue });

    if (!this.authService.uid() || !this.connected()) {
      this.openConnectionDialog();
      return;
    }
    if (this.needsPremium()) {
      this.error.set($localize`Spotify Premium is required for full-song playback inside LivingWiki.`);
      this.openConnectionDialog();
      return;
    }

    try {
      const resolvedQueue = await this.resolveTracksForPlayback(this.queue);
      const resolvedTrack = resolvedQueue[0];
      if (!resolvedTrack?.uri) {
        throw new Error(`Spotify could not find "${track.title}". Try the Spotify search link instead.`);
      }
      this.queue = resolvedQueue;
      this.currentTrack.set(resolvedTrack);
      this.savePendingPlayback({ track: resolvedTrack, queue: resolvedQueue });
      if (this.player) {
        await this.player.activateElement().catch(() => undefined);
      }
      const deviceId = await this.initializePlayer();
      await this.controlPlayback('play', {
        deviceId: this.selectedDeviceId() || deviceId,
        uris: this.queue.map((item) => item.uri),
      });
      this.selectedDeviceId.set(this.selectedDeviceId() || deviceId);
      this.playing.set(true);
      this.positionMs.set(0);
      this.clearPendingPlayback();
    } catch (error) {
      this.playing.set(false);
      this.error.set(this.friendlyError(
        error,
        $localize`Spotify could not start playback. Open Spotify once, then try again.`,
      ));
    }
  }

  async togglePlayback(): Promise<void> {
    const track = this.currentTrack();
    if (!track) {
      return;
    }
    if (!this.connected()) {
      this.openConnectionDialog();
      return;
    }
    if (!this.durationMs() && !this.playing()) {
      await this.requestPlay(track, this.queue.length ? this.queue : [track]);
      return;
    }
    this.error.set(null);
    try {
      if (this.player && this.selectedDeviceId() === this.browserDeviceId) {
        await this.player.activateElement().catch(() => undefined);
        await this.player.togglePlay();
        return;
      }
      await this.controlPlayback(this.playing() ? 'pause' : 'resume', {
        deviceId: this.selectedDeviceId(),
      });
      this.playing.update((playing) => !playing);
    } catch (error) {
      this.error.set(this.friendlyError(error, $localize`Spotify could not change playback.`));
    }
  }

  async next(): Promise<void> {
    await this.changeTrack('next');
  }

  async previous(): Promise<void> {
    await this.changeTrack('previous');
  }

  async seek(positionMs: number): Promise<void> {
    const safePosition = Math.max(0, Math.min(positionMs, this.durationMs()));
    this.positionMs.set(safePosition);
    try {
      if (this.player && this.selectedDeviceId() === this.browserDeviceId) {
        await this.player.seek(safePosition);
      } else {
        await this.controlPlayback('seek', {
          deviceId: this.selectedDeviceId(),
          positionMs: safePosition,
        });
      }
    } catch (error) {
      this.error.set(this.friendlyError(error, $localize`Spotify could not seek to that position.`));
    }
  }

  async refreshDevices(): Promise<void> {
    if (!this.functions || !this.connected()) {
      this.devices.set([]);
      return;
    }
    try {
      const callable = httpsCallable<Record<string, never>, { devices: SpotifyDevice[] }>(
        this.functions,
        'listSpotifyDevices',
      );
      const result = await callable({});
      const devices = [...(result.data.devices ?? [])];
      if (this.browserDeviceId && !devices.some((device) => device.id === this.browserDeviceId)) {
        devices.unshift({
          id: this.browserDeviceId,
          name: 'This browser',
          type: 'Computer',
          isActive: this.selectedDeviceId() === this.browserDeviceId,
          isRestricted: false,
          volumePercent: 80,
        });
      }
      this.devices.set(devices);
      const active = devices.find((device) => device.isActive);
      if (!this.selectedDeviceId()) {
        this.selectedDeviceId.set(active?.id || this.browserDeviceId || devices[0]?.id || '');
      }
    } catch (error) {
      this.error.set(this.friendlyError(error, $localize`Could not load Spotify devices.`));
    }
  }

  async selectDevice(deviceId: string): Promise<void> {
    if (!deviceId || deviceId === this.selectedDeviceId()) {
      return;
    }
    this.error.set(null);
    try {
      await this.controlPlayback('transfer', { deviceId });
      this.selectedDeviceId.set(deviceId);
      this.playing.set(true);
      this.devices.update((devices) => devices.map((device) => ({
        ...device,
        isActive: device.id === deviceId,
      })));
    } catch (error) {
      this.error.set(this.friendlyError(error, $localize`Could not move playback to that device.`));
    }
  }

  isTrackActive(uri: string): boolean {
    return !!uri && this.currentTrack()?.uri === uri;
  }

  formatTime(milliseconds: number): string {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
      return '0:00';
    }
    const totalSeconds = Math.floor(milliseconds / 1000);
    return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
  }

  private async initializePlayer(): Promise<string> {
    if (this.playerReady() && this.browserDeviceId) {
      return this.browserDeviceId;
    }
    if (this.readyPromise) {
      return this.readyPromise;
    }
    this.playerInitializing.set(true);
    await this.loadSdk();
    const sdkWindow = window as SpotifySdkWindow;
    if (!sdkWindow.Spotify?.Player) {
      this.playerInitializing.set(false);
      throw new Error('The Spotify player did not load.');
    }

    this.readyPromise = new Promise<string>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    this.player = new sdkWindow.Spotify.Player({
      name: 'LivingWiki',
      volume: 0.8,
      enableMediaSession: true,
      getOAuthToken: (callback) => {
        void this.getPlaybackToken()
          .then(callback)
          .catch((error) => {
            this.failPlayer(this.friendlyError(error, 'Spotify needs to be reconnected.'));
          });
      },
    });

    this.player.addListener('ready', ({ device_id: deviceId }: { device_id?: string }) => {
      if (!deviceId) {
        this.failPlayer('Spotify did not provide a playback device.');
        return;
      }
      this.browserDeviceId = deviceId;
      this.selectedDeviceId.set(deviceId);
      this.playerReady.set(true);
      this.playerInitializing.set(false);
      this.resolveReady?.(deviceId);
      this.resolveReady = null;
      this.rejectReady = null;
      void this.refreshDevices();
    });
    this.player.addListener('not_ready', ({ device_id: deviceId }: { device_id?: string }) => {
      if (deviceId && deviceId === this.browserDeviceId) {
        this.playerReady.set(false);
      }
    });
    this.player.addListener('player_state_changed', (state: SpotifySdkState | null) => {
      this.syncPlayerState(state);
    });
    this.player.addListener('initialization_error', ({ message }: { message?: string }) => {
      this.failPlayer(message || 'Spotify could not initialize this browser.');
    });
    this.player.addListener('authentication_error', ({ message }: { message?: string }) => {
      this.connection.update((connection) => ({ ...connection, needsReauthorization: true }));
      this.failPlayer(message || 'Spotify needs to be reconnected.');
    });
    this.player.addListener('account_error', () => {
      this.failPlayer('Spotify Premium is required for full-song playback inside LivingWiki.');
    });
    this.player.addListener('playback_error', ({ message }: { message?: string }) => {
      this.error.set(message || $localize`Spotify could not play this track.`);
    });
    this.player.addListener('autoplay_failed', () => {
      this.notice.set('Tap play once to let this browser start Spotify audio.');
    });

    const connected = await this.player.connect();
    if (!connected) {
      this.failPlayer('Spotify could not connect this browser.');
    }

    const readyPromise = this.readyPromise;
    const timeout = new Promise<never>((_resolve, reject) => {
      window.setTimeout(() => reject(new Error('Spotify took too long to make this browser ready.')), 12_000);
    });
    try {
      return await Promise.race([readyPromise, timeout]);
    } catch (error) {
      this.readyPromise = null;
      this.playerInitializing.set(false);
      throw error;
    }
  }

  private loadSdk(): Promise<void> {
    if (this.sdkPromise) {
      return this.sdkPromise;
    }
    const sdkWindow = window as SpotifySdkWindow;
    if (sdkWindow.Spotify?.Player) {
      this.sdkPromise = Promise.resolve();
      return this.sdkPromise;
    }
    this.sdkPromise = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-livingwiki-spotify-sdk]');
      const previousReady = sdkWindow.onSpotifyWebPlaybackSDKReady;
      sdkWindow.onSpotifyWebPlaybackSDKReady = () => {
        previousReady?.();
        resolve();
      };
      if (existing) {
        existing.addEventListener('error', () => reject(new Error('Spotify could not load.')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.async = true;
      script.dataset['livingwikiSpotifySdk'] = 'true';
      script.addEventListener('error', () => reject(new Error('Spotify could not load.')), { once: true });
      document.head.appendChild(script);
    });
    return this.sdkPromise;
  }

  private async getPlaybackToken(): Promise<string> {
    if (!this.functions) {
      throw new Error('Spotify playback is unavailable here.');
    }
    const callable = httpsCallable<Record<string, never>, { accessToken: string }>(
      this.functions,
      'getSpotifyPlaybackToken',
    );
    const result = await callable({});
    if (!result.data.accessToken) {
      throw new Error('Spotify returned no playback token.');
    }
    return result.data.accessToken;
  }

  private async controlPlayback(
    action: string,
    values: { deviceId?: string; uris?: string[]; positionMs?: number } = {},
  ): Promise<void> {
    if (!this.functions) {
      throw new Error('Spotify playback is unavailable here.');
    }
    const callable = httpsCallable<
      { action: string; deviceId?: string; uris?: string[]; positionMs?: number },
      { ok: boolean }
    >(this.functions, 'controlSpotifyPlayback');
    await callable({
      action,
      ...(values.deviceId ? { deviceId: values.deviceId } : {}),
      ...(values.uris ? { uris: values.uris } : {}),
      ...(typeof values.positionMs === 'number' ? { positionMs: values.positionMs } : {}),
    });
  }

  private async changeTrack(action: 'next' | 'previous'): Promise<void> {
    if (!this.connected()) {
      this.openConnectionDialog();
      return;
    }
    this.error.set(null);
    try {
      if (this.player && this.selectedDeviceId() === this.browserDeviceId) {
        await (action === 'next' ? this.player.nextTrack() : this.player.previousTrack());
      } else {
        await this.controlPlayback(action, { deviceId: this.selectedDeviceId() });
      }
    } catch (error) {
      this.error.set(this.friendlyError(error, `Spotify could not go to the ${action} track.`));
    }
  }

  private syncPlayerState(state: SpotifySdkState | null): void {
    if (!state) {
      this.playing.set(false);
      return;
    }
    this.playing.set(state.paused !== true);
    this.positionMs.set(Math.max(0, Number(state.position) || 0));
    this.durationMs.set(Math.max(0, Number(state.duration) || 0));
    const sdkTrack = state.track_window?.current_track;
    const uri = sdkTrack?.uri?.trim() ?? '';
    if (!uri) {
      return;
    }
    const queued = this.queue.find((track) => track.uri === uri);
    this.currentTrack.set(queued ?? {
      uri,
      title: sdkTrack?.name?.trim() || 'Spotify track',
      artist: sdkTrack?.artists?.map((artist) => artist.name?.trim()).filter(Boolean).join(', ') || 'Spotify',
      album: sdkTrack?.album?.name?.trim() || '',
      artworkUrl: sdkTrack?.album?.images?.[0]?.url?.trim() || '',
      spotifyUrl: `https://open.spotify.com/track/${encodeURIComponent(uri.replace('spotify:track:', ''))}`,
    });
  }

  private failPlayer(message: string): void {
    this.error.set(message);
    this.playerInitializing.set(false);
    this.playerReady.set(false);
    this.rejectReady?.(new Error(message));
    this.resolveReady = null;
    this.rejectReady = null;
    this.readyPromise = null;
  }

  private normalizedQueue(track: SpotifyTrack, queue: SpotifyTrack[]): SpotifyTrack[] {
    const playable = queue.filter((item) => (
      /^spotify:track:[A-Za-z0-9]{12,32}$/i.test(item.uri)
      || !!(item.lookupTitle || item.title).trim()
    ));
    const keyFor = (item: SpotifyTrack) => item.uri
      || `${item.lookupTitle || item.title}\u0000${item.lookupArtist || item.artist}`;
    const unique = [...new Map(playable.map((item) => [keyFor(item), item])).values()];
    const selectedKey = keyFor(track);
    return [track, ...unique.filter((item) => keyFor(item) !== selectedKey)].slice(0, 40);
  }

  private async resolveTracksForPlayback(tracks: SpotifyTrack[]): Promise<SpotifyTrack[]> {
    const missing = tracks.filter((track) => !/^spotify:track:[A-Za-z0-9]{12,32}$/i.test(track.uri));
    if (!missing.length) {
      return tracks;
    }
    if (!this.functions) {
      throw new Error('Spotify playback is unavailable here.');
    }
    const callable = httpsCallable<
      {
        tracks: Array<{
          key: string;
          title: string;
          artist: string;
          context: string;
        }>;
      },
      { tracks: Array<SpotifyTrack & { key: string }> }
    >(this.functions, 'resolveSpotifyPlaybackTracks');
    const result = await callable({
      tracks: missing.map((track, index) => ({
        key: String(index),
        title: track.lookupTitle || track.title,
        artist: track.lookupArtist || track.artist,
        context: track.lookupContext || '',
      })),
    });
    const matches = new Map(
      (result.data.tracks ?? []).map((track) => [track.key, track]),
    );
    let missingIndex = 0;
    return tracks.flatMap((track) => {
      if (/^spotify:track:[A-Za-z0-9]{12,32}$/i.test(track.uri)) {
        return [track];
      }
      const match = matches.get(String(missingIndex));
      missingIndex += 1;
      return match ? [{
        ...track,
        ...match,
        artworkUrl: match.artworkUrl || track.artworkUrl,
        spotifyUrl: match.spotifyUrl || track.spotifyUrl,
      }] : [];
    });
  }

  private savePendingPlayback(value: PendingPlayback): void {
    if (!this.isBrowser) {
      return;
    }
    try {
      window.sessionStorage.setItem(pendingPlaybackKey, JSON.stringify(value));
    } catch {
      // Playback can continue without cross-redirect restoration.
    }
  }

  private restorePendingPlayback(): void {
    if (!this.isBrowser || this.currentTrack()) {
      return;
    }
    try {
      const raw = window.sessionStorage.getItem(pendingPlaybackKey);
      const value = raw ? JSON.parse(raw) as PendingPlayback : null;
      if (!value?.track?.uri) {
        return;
      }
      this.currentTrack.set(value.track);
      this.queue = this.normalizedQueue(value.track, value.queue ?? [value.track]);
      this.notice.set('Spotify is connected. Tap play to start the song you chose.');
    } catch {
      this.clearPendingPlayback();
    }
  }

  private clearPendingPlayback(): void {
    if (!this.isBrowser) {
      return;
    }
    try {
      window.sessionStorage.removeItem(pendingPlaybackKey);
    } catch {
      // Ignore unavailable storage.
    }
  }

  private readOAuthResult(): void {
    const url = new URL(window.location.href);
    const status = url.searchParams.get('spotify');
    if (!status) {
      return;
    }
    if (status === 'connected') {
      this.notice.set('Spotify connected. Your boards can now play full songs here.');
      this.connectDialogOpen.set(true);
    } else {
      const code = url.searchParams.get('spotify_error');
      this.error.set(this.oauthErrorMessage(code));
      this.connectDialogOpen.set(true);
    }
    url.searchParams.delete('spotify');
    url.searchParams.delete('spotify_error');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }

  private cleanCurrentUrl(): string {
    const url = new URL(window.location.href);
    url.searchParams.delete('spotify');
    url.searchParams.delete('spotify_error');
    return url.toString();
  }

  private resetConnection(): void {
    this.connection.set(emptyConnection);
    this.player?.disconnect();
    this.player = null;
    this.readyPromise = null;
    this.browserDeviceId = '';
    this.playerReady.set(false);
    this.playerInitializing.set(false);
    this.devices.set([]);
    this.selectedDeviceId.set('');
  }

  private startProgressClock(): void {
    if (this.progressTimer) {
      return;
    }
    this.progressTimer = window.setInterval(() => {
      if (!this.playing() || !this.durationMs()) {
        return;
      }
      this.positionMs.update((position) => Math.min(this.durationMs(), position + 1000));
    }, 1000);
  }

  private oauthErrorMessage(code: string | null): string {
    const messages: Record<string, string> = {
      cancelled: 'Spotify connection was cancelled. Nothing was changed.',
      expired: 'That Spotify connection link expired. Please try again.',
      configuration: 'Spotify is not configured for LivingWiki yet.',
      unavailable: 'Spotify is temporarily unavailable. Please try again.',
      connection_failed:
        'Spotify could not finish the optional account connection. You can still play songs here with the official Spotify player. Enhanced controls are currently limited to approved LivingWiki beta accounts.',
    };
    return messages[code ?? '']
      ?? 'Spotify could not finish the optional connection. You can still use the official player on every music card.';
  }

  private friendlyError(error: unknown, fallback: string): string {
    if (error instanceof FirebaseError) {
      if (error.code.includes('unauthenticated')) {
        return 'Sign in to LivingWiki before connecting Spotify.';
      }
      if (error.code.includes('failed-precondition')) {
        return error.message || 'Spotify needs to be reconnected.';
      }
      if (error.code.includes('permission-denied')) {
        return error.message || 'Spotify did not allow that playback action.';
      }
      if (error.code.includes('not-found')) {
        return 'No Spotify player is available. Open Spotify once or choose this browser.';
      }
      if (error.code.includes('resource-exhausted')) {
        return 'Spotify is busy right now. Please wait a moment and try again.';
      }
      return error.message || fallback;
    }
    return error instanceof Error && error.message ? error.message : fallback;
  }
}
