import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { GraphAnimationComponent } from '../marketing/atlas-animation/graph-animation';

@Component({
  selector: 'app-wiki',
  imports: [RouterLink, ThemeToggleComponent, GraphAnimationComponent],
  templateUrl: './wiki.html',
})
export class WikiComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef);

  readonly isSigningOut = signal(false);
  readonly avatarMenuOpen = signal(false);
  readonly currentUserName = this.authService.displayName;
  readonly currentUserEmail = this.authService.email;

  readonly userInitials = () => {
    const name = this.currentUserName();
    if (!name) return '?';
    return name
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  };

  askPanelExpanded = true;

  readonly tags = ['Machine Learning', 'Architecture', 'Memory Systems'];

  readonly stats = [
    { label: 'Backlinks', value: '142', hint: '24 newly inferred connections' },
    { label: 'Source Papers', value: '12', hint: '8 primary and 4 secondary sources' },
    { label: 'Knowledge Density', value: 'High', hint: 'Entity overlap is above baseline' },
  ];

  readonly summary = [
    'The attention mechanism transformed sequence modeling by replacing recurrence with dynamic retrieval. Instead of forcing information through a fixed-size hidden state, it scores the relevance of every token against every other token and composes a context-aware representation in parallel.',
    'Within Living Atlas, the same pattern maps cleanly to knowledge work: queries express what you need, keys expose where meaning lives, and values recover the exact passages, citations, or concepts that should surface in response. The result is retrieval that feels closer to directed memory than keyword matching.',
  ];

  readonly architecturalComponents = [
    {
      title: 'Query, Key, and Value vectors',
      body: 'Queries represent intent, keys represent addressability, and values carry the content being retrieved. The mechanism works because relevance is scored before information is merged.',
    },
    {
      title: 'Scaled dot-product attention',
      body: 'Similarity is computed at high throughput, then normalized so the model can compare signals without saturating. Scaling stabilizes training and keeps long-context behavior usable.',
    },
    {
      title: 'Multi-head attention',
      body: 'Multiple heads attend to different relationships at once. One head can model syntax, another positional dependency, and another long-range semantic linkage.',
    },
    {
      title: 'Residual pathways and feed-forward blocks',
      body: 'Attention is only part of the stack. Residual streams preserve information flow while feed-forward layers expand and compress representations into more useful abstractions.',
    },
  ];

  readonly sourceDocuments = [
    {
      title: 'Vaswani_Attention_Is_All_You_Need.pdf',
      meta: 'Added Dec 12, 2023 • 4.2 MB',
      icon: 'picture_as_pdf',
      color: '#8fd9a8',
      background: 'rgba(59, 175, 98, 0.12)',
    },
    {
      title: 'Stanford_CS25_Transformers_Notes.md',
      meta: 'Added Jan 05, 2024 • 184 KB',
      icon: 'article',
      color: '#f0c98b',
      background: 'rgba(240, 201, 139, 0.14)',
    },
    {
      title: 'Working_Memory_Comparative_Models.docx',
      meta: 'Added Feb 19, 2024 • 1.1 MB',
      icon: 'description',
      color: '#8ad7c3',
      background: 'rgba(63, 185, 156, 0.14)',
    },
  ];

  readonly linkedMentions = [
    {
      title: 'Transformers',
      excerpt:
        'The decisive shift was the full reliance on attention for sequence modeling, which removed the recurrence bottleneck and opened the door for scale.',
    },
    {
      title: 'Large Language Models',
      excerpt:
        'Scaling laws are tightly coupled to context handling, which makes attention efficiency one of the key constraints on model capability.',
    },
    {
      title: 'Cognitive Offloading',
      excerpt:
        'External systems become usable memory only when retrieval is selective, relevant, and fast enough to preserve a chain of thought.',
    },
  ];

  readonly timeline = [
    { label: 'Initial ingestion', value: 'Dec 12, 2023' },
    { label: 'Cross-linked concepts', value: 'Jan 05, 2024' },
    { label: 'Last synthesis pass', value: '2 minutes ago' },
  ];

  readonly footerActions = ['Export as Markdown', 'Download PDF', 'Duplicate Page'];

  expandAskPanel(): void {
    this.askPanelExpanded = true;
  }

  collapseAskPanel(): void {
    this.askPanelExpanded = false;
  }

  toggleAvatarMenu(): void {
    this.avatarMenuOpen.update((open) => !open);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.querySelector('.avatar-menu-wrapper')?.contains(event.target as Node)) {
      this.avatarMenuOpen.set(false);
    }
  }

  async signOut(): Promise<void> {
    this.isSigningOut.set(true);
    this.avatarMenuOpen.set(false);

    try {
      await this.authService.signOut();
      await this.router.navigateByUrl('/');
    } finally {
      this.isSigningOut.set(false);
    }
  }
}
