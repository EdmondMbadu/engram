import { Component, computed, inject, LOCALE_ID, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AccountMenuComponent } from '../account-menu/account-menu';
import { MobileMenuComponent } from '../mobile-menu/mobile-menu';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { WorkspaceSidebarComponent } from '../workspace-sidebar/workspace-sidebar';
import {
  videoLibraryItemIsCurrent,
  type VideoLibraryItem,
} from './video-library.models';
import { VideoLibraryService } from './video-library.service';

type VideoLibrarySort = 'newest' | 'oldest' | 'title';

@Component({
  selector: 'app-video-library',
  imports: [
    RouterLink,
    WorkspaceSidebarComponent,
    MobileMenuComponent,
    ThemeToggleComponent,
    AccountMenuComponent,
  ],
  templateUrl: './video-library.html',
  styleUrl: './video-library.css',
})
export class VideoLibraryComponent {
  private readonly videoLibrary = inject(VideoLibraryService);
  private readonly router = inject(Router);
  private readonly localeId = inject(LOCALE_ID);

  readonly items = signal<VideoLibraryItem[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly message = signal<string | null>(null);
  readonly search = signal('');
  readonly sort = signal<VideoLibrarySort>('newest');
  readonly selectedVideo = signal<VideoLibraryItem | null>(null);
  readonly deleteCandidate = signal<VideoLibraryItem | null>(null);
  readonly deletingId = signal<string | null>(null);
  readonly sharingId = signal<string | null>(null);

  readonly visibleItems = computed(() => {
    const query = this.search().trim().toLowerCase();
    const filtered = query
      ? this.items().filter((item) => [item.sourceTitle, this.ratioLabel(item), item.narrationEnabled ? 'narration' : 'music only']
        .join(' ')
        .toLowerCase()
        .includes(query))
      : this.items();
    return [...filtered].sort((left, right) => {
      if (this.sort() === 'oldest') return left.generatedAt.localeCompare(right.generatedAt);
      if (this.sort() === 'title') return left.sourceTitle.localeCompare(right.sourceTitle);
      return right.generatedAt.localeCompare(left.generatedAt);
    });
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.items.set(await this.videoLibrary.loadItems());
    } catch (error) {
      console.error('Video library load failed', error);
      this.error.set('My Videos could not be loaded. Check your connection and try again.');
    } finally {
      this.loading.set(false);
    }
  }

  setSearch(value: string): void {
    this.search.set(value);
  }

  setSort(value: string): void {
    if (value === 'oldest' || value === 'title') {
      this.sort.set(value);
      return;
    }
    this.sort.set('newest');
  }

  play(item: VideoLibraryItem): void {
    this.selectedVideo.set(item);
  }

  closePlayer(): void {
    this.selectedVideo.set(null);
  }

  async openStudio(item: VideoLibraryItem): Promise<void> {
    if (!item.sourceAvailable) return;
    await this.router.navigate(['/boards', item.sourceId], { queryParams: { share: 'video' } });
  }

  async share(item: VideoLibraryItem): Promise<void> {
    if (this.sharingId()) return;
    this.sharingId.set(item.id);
    this.message.set(null);
    try {
      const response = await fetch(item.videoUrl);
      if (!response.ok) throw new Error('The video file could not be loaded.');
      const blob = await response.blob();
      const extension = item.mimeType.includes('webm') ? 'webm' : 'mp4';
      const file = new File([blob], `${this.safeFileName(item.sourceTitle)}.${extension}`, {
        type: item.mimeType || blob.type || `video/${extension}`,
      });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: item.sourceTitle, files: [file] });
        this.message.set('Video shared.');
        return;
      }
      if (item.publicShareUrl && navigator.share) {
        await navigator.share({ title: item.sourceTitle, url: item.publicShareUrl });
        this.message.set('Video link shared.');
        return;
      }
      this.downloadFile(file);
      this.message.set('Video downloaded. Attach it in the app where you want to share it.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        this.message.set('Share cancelled.');
      } else {
        this.message.set(error instanceof Error ? error.message : 'The video could not be shared.');
      }
    } finally {
      this.sharingId.set(null);
    }
  }

  async download(item: VideoLibraryItem): Promise<void> {
    this.message.set(null);
    try {
      const response = await fetch(item.videoUrl);
      if (!response.ok) throw new Error('The video file could not be loaded.');
      const blob = await response.blob();
      const extension = item.mimeType.includes('webm') ? 'webm' : 'mp4';
      this.downloadFile(new File([blob], `${this.safeFileName(item.sourceTitle)}.${extension}`, {
        type: item.mimeType || blob.type || `video/${extension}`,
      }));
      this.message.set('Video downloaded.');
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'The video could not be downloaded.');
    }
  }

  async copyPublicLink(item: VideoLibraryItem): Promise<void> {
    if (!item.publicShareUrl) {
      this.message.set('Publish this video from Board Studio to create a public video link.');
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(item.publicShareUrl);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = item.publicShareUrl;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        const copied = document.execCommand('copy');
        textArea.remove();
        if (!copied) throw new Error('Copy was blocked.');
      }
      this.message.set('Public video link copied.');
    } catch {
      this.message.set('The link could not be copied. Select the address and copy it manually.');
    }
  }

  requestDelete(item: VideoLibraryItem): void {
    this.deleteCandidate.set(item);
  }

  closeDelete(): void {
    if (!this.deletingId()) this.deleteCandidate.set(null);
  }

  async confirmDelete(): Promise<void> {
    const item = this.deleteCandidate();
    if (!item || this.deletingId()) return;
    this.deletingId.set(item.id);
    this.message.set(null);
    try {
      await this.videoLibrary.deleteItem(item);
      this.items.update((items) => items.filter((candidate) => candidate.id !== item.id));
      if (this.selectedVideo()?.id === item.id) this.selectedVideo.set(null);
      this.deleteCandidate.set(null);
      this.message.set('Video deleted from My Videos.');
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'The video could not be deleted.');
    } finally {
      this.deletingId.set(null);
    }
  }

  isCurrent(item: VideoLibraryItem): boolean {
    return videoLibraryItemIsCurrent(item);
  }

  ratioLabel(item: VideoLibraryItem): string {
    if (item.ratio === 'square') return 'Square · 1:1';
    if (item.ratio === 'landscape') return 'Landscape · 16:9';
    return 'Vertical · 9:16';
  }

  updatedLabel(item: VideoLibraryItem): string {
    const date = new Date(item.generatedAt);
    if (!Number.isFinite(date.getTime())) return 'Saved recently';
    const deltaSeconds = Math.round((date.getTime() - Date.now()) / 1000);
    const absolute = Math.abs(deltaSeconds);
    const formatter = new Intl.RelativeTimeFormat(this.localeId, { numeric: 'auto' });
    if (absolute < 60) return formatter.format(deltaSeconds, 'second');
    if (absolute < 3600) return formatter.format(Math.round(deltaSeconds / 60), 'minute');
    if (absolute < 86400) return formatter.format(Math.round(deltaSeconds / 3600), 'hour');
    if (absolute < 604800) return formatter.format(Math.round(deltaSeconds / 86400), 'day');
    return new Intl.DateTimeFormat(this.localeId, { dateStyle: 'medium' }).format(date);
  }

  durationLabel(item: VideoLibraryItem): string {
    if (!item.durationSeconds) return '';
    const total = Math.max(0, Math.round(item.durationSeconds));
    const minutes = Math.floor(total / 60);
    const seconds = `${total % 60}`.padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  private downloadFile(file: File): void {
    const url = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private safeFileName(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
      || 'livingwiki-video';
  }
}
