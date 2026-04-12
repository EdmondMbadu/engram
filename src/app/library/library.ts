import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';

@Component({
  selector: 'app-library',
  imports: [RouterLink, ThemeToggleComponent],
  templateUrl: './library.html',
})
export class LibraryComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly isSigningOut = signal(false);
  readonly currentUserName = this.authService.displayName;
  readonly currentUserEmail = this.authService.email;

  readonly stats = [
    { value: '142', label: 'Total Documents', valueClass: 'text-[var(--text)]' },
    { value: '56', label: 'Wiki Pages Generated', valueClass: 'text-[var(--text)]' },
    { value: '892', label: 'Total Citations', valueClass: 'text-[var(--text)]' },
    { value: '12', label: 'Knowledge Gaps', valueClass: 'text-[var(--accent)]' },
  ];

  readonly documents = [
    {
      title: 'IRS_Publication_535.pdf',
      addedOn: 'Apr 3 2025',
      icon: 'picture_as_pdf',
      iconClasses: 'bg-[rgba(59,175,98,0.12)] text-[#8fd9a8]',
      status: 'Indexed',
      statusClasses:
        'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
      wikiPages: '6 wiki pages',
      citations: '24 citations',
    },
    {
      title: 'Client_Contract_2024.docx',
      addedOn: 'Mar 28 2025',
      icon: 'description',
      iconClasses: 'bg-sky-500/10 text-sky-400',
      status: 'Indexed',
      statusClasses:
        'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
      wikiPages: '3 wiki pages',
      citations: '8 citations',
    },
    {
      title: 'Q4_Meeting_Notes.md',
      addedOn: 'Apr 8 2025',
      icon: 'article',
      iconClasses: 'bg-teal-400/10 text-teal-300',
      status: 'Processing',
      statusClasses:
        'border border-amber-500/20 bg-amber-500/10 text-amber-400',
      wikiPages: '-- wiki pages',
      citations: '-- citations',
    },
    {
      title: 'Freelancer_Guide_2025.pdf',
      addedOn: 'Apr 1 2025',
      icon: 'picture_as_pdf',
      iconClasses: 'bg-[rgba(59,175,98,0.12)] text-[#8fd9a8]',
      status: 'Indexed',
      statusClasses:
        'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
      wikiPages: '5 wiki pages',
      citations: '19 citations',
    },
    {
      title: 'Project_Scope_Template.txt',
      addedOn: 'Mar 15 2025',
      icon: 'text_snippet',
      iconClasses: 'bg-stone-400/10 text-stone-400',
      status: 'Pending',
      statusClasses:
        'border border-white/10 bg-white/5 text-[var(--muted)]',
      wikiPages: '0 wiki pages',
      citations: '0 citations',
    },
  ];

  readonly knowledgeGaps = [
    'Contractor liability',
    'Q4 projections',
    'Onboarding checklist',
    'GDPR compliance',
    'Invoice late fees',
  ];

  async signOut(): Promise<void> {
    this.isSigningOut.set(true);

    try {
      await this.authService.signOut();
      await this.router.navigateByUrl('/');
    } finally {
      this.isSigningOut.set(false);
    }
  }
}
