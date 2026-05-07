import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { AnswerQuizGrade, AnswerQuizGradeResult, AnswerQuizItem } from '../atlas.models';
import { AnswerQuizService, type QuizAnswerInput } from '../answer-quiz.service';
import { AuthService } from '../auth.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';

@Component({
  selector: 'app-answer-quiz',
  imports: [RouterLink, ThemeToggleComponent],
  templateUrl: './answer-quiz.html',
  styleUrl: './answer-quiz.css',
})
export class AnswerQuizComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly quizService = inject(AnswerQuizService);
  private readonly authService = inject(AuthService);
  private readonly startedAt = Date.now();

  readonly quiz = signal<AnswerQuizItem | null>(null);
  readonly selectedAnswers = signal<Record<string, string>>({});
  readonly grade = signal<AnswerQuizGrade | null>(null);
  readonly leaderboard = signal<AnswerQuizItem['leaderboard']>([]);
  readonly isLoading = signal(true);
  readonly isGrading = signal(false);
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly statusMessage = signal<string | null>(null);
  readonly shareModalOpen = signal(false);
  readonly shareFeedback = signal<string | null>(null);
  readonly copied = signal(false);

  readonly isSignedIn = this.authService.isAuthenticated;
  readonly displayName = this.authService.displayName;

  readonly answeredCount = computed(() => Object.keys(this.selectedAnswers()).length);
  readonly canFinish = computed(() => {
    const quiz = this.quiz();
    return !!quiz && this.answeredCount() === quiz.questions.length && !this.grade();
  });
  readonly signInRedirect = computed(() => {
    const quiz = this.quiz();
    return quiz ? `/quiz/${quiz.id}` : '/wikis';
  });
  readonly shareUrl = computed(() => {
    const quiz = this.quiz();
    if (!quiz) {
      return '';
    }
    return typeof window === 'undefined' ? `/quiz/${quiz.id}` : `${window.location.origin}/quiz/${quiz.id}`;
  });

  constructor() {
    const quizId = this.route.snapshot.paramMap.get('quizId')?.trim() ?? '';
    void this.loadQuiz(quizId);
  }

  selectAnswer(questionId: string, optionId: string): void {
    if (this.grade()) {
      return;
    }
    this.selectedAnswers.update((answers) => ({ ...answers, [questionId]: optionId }));
  }

  async finishQuiz(): Promise<void> {
    const quiz = this.quiz();
    if (!quiz || !this.canFinish() || this.isGrading()) {
      return;
    }

    this.isGrading.set(true);
    this.errorMessage.set(null);
    this.statusMessage.set(null);
    try {
      this.grade.set(await this.quizService.gradeAttempt(quiz.id, this.answerPayload()));
      this.statusMessage.set('Score ready. Sign in to add it to the leaderboard.');
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Could not grade this quiz.');
    } finally {
      this.isGrading.set(false);
    }
  }

  async submitScore(): Promise<void> {
    const quiz = this.quiz();
    if (!quiz || !this.grade() || !this.isSignedIn() || this.isSubmitting()) {
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);
    try {
      const result = await this.quizService.submitScore(quiz.id, this.answerPayload(), Date.now() - this.startedAt);
      this.grade.set(result.grade);
      this.leaderboard.set(result.leaderboard);
      this.statusMessage.set(result.savedBest ? 'Saved to the leaderboard.' : 'Attempt recorded. Your best score stayed on the board.');
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Could not save your score.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  resetAttempt(): void {
    this.selectedAnswers.set({});
    this.grade.set(null);
    this.statusMessage.set(null);
  }

  openShareModal(): void {
    this.shareModalOpen.set(true);
    this.shareFeedback.set(null);
  }

  closeShareModal(): void {
    this.shareModalOpen.set(false);
    this.shareFeedback.set(null);
  }

  async copyLink(): Promise<void> {
    const url = this.shareUrl();
    if (!url) {
      return;
    }

    await this.copyShareText(url);
    this.copied.set(true);
    this.shareFeedback.set('Link copied');
    setTimeout(() => this.copied.set(false), 1400);
    setTimeout(() => this.shareFeedback.set(null), 1800);
  }

  async nativeShareQuiz(): Promise<void> {
    const quiz = this.quiz();
    const url = this.shareUrl();
    if (!quiz || !url || typeof navigator === 'undefined') {
      return;
    }

    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: quiz.title, text: quiz.description, url });
        this.shareFeedback.set('Share sheet opened');
      } else {
        await this.copyShareText(url);
        this.shareFeedback.set('Link copied');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      await this.copyShareText(url);
      this.shareFeedback.set('Share failed. Link copied instead.');
    }
    setTimeout(() => this.shareFeedback.set(null), 2200);
  }

  async shareTo(platform: string): Promise<void> {
    const quiz = this.quiz();
    const url = this.shareUrl();
    if (!quiz || !url) {
      return;
    }

    await this.copyShareText(`${this.shareText(quiz)}\n${url}`);
    const labels: Record<string, string> = {
      instagram: 'Copied for Instagram',
      tiktok: 'Copied for TikTok',
      youtube: 'Copied for YouTube',
    };
    this.shareFeedback.set(labels[platform] ?? 'Copied');
    setTimeout(() => this.shareFeedback.set(null), 2200);
  }

  shareHref(platform: string): string {
    const quiz = this.quiz();
    const url = this.shareUrl();
    if (!quiz || !url) {
      return '#';
    }

    const encodedUrl = encodeURIComponent(url);
    const encodedTitle = encodeURIComponent(quiz.title);
    const encodedText = encodeURIComponent(this.shareText(quiz));
    const encodedTextWithUrl = encodeURIComponent(`${this.shareText(quiz)}\n${url}`);
    const shareTargets: Record<string, string> = {
      x: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      reddit: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`,
      whatsapp: `https://wa.me/?text=${encodedTextWithUrl}`,
      email: `mailto:?subject=${encodedTitle}&body=${encodedTextWithUrl}`,
    };
    return shareTargets[platform] ?? '#';
  }

  selectedOption(questionId: string): string | null {
    return this.selectedAnswers()[questionId] ?? null;
  }

  resultFor(questionId: string): AnswerQuizGradeResult | null {
    return this.grade()?.results.find((result) => result.questionId === questionId) ?? null;
  }

  optionState(questionId: string, optionId: string): string {
    const result = this.resultFor(questionId);
    if (!result) {
      return this.selectedOption(questionId) === optionId ? 'selected' : '';
    }
    if (result.correctOptionId === optionId) {
      return 'correct';
    }
    if (result.selectedOptionId === optionId && !result.correct) {
      return 'incorrect';
    }
    return '';
  }

  formatTime(ms: number): string {
    if (!ms) {
      return 'fast';
    }
    const seconds = Math.max(1, Math.round(ms / 1000));
    if (seconds < 60) {
      return `${seconds}s`;
    }
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }

  private async loadQuiz(quizId: string): Promise<void> {
    if (!quizId) {
      this.errorMessage.set('Quiz not found.');
      this.isLoading.set(false);
      return;
    }

    try {
      const quiz = await this.quizService.getQuiz(quizId);
      this.quiz.set(quiz);
      this.leaderboard.set(quiz.leaderboard);
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Quiz not found.');
    } finally {
      this.isLoading.set(false);
    }
  }

  private answerPayload(): QuizAnswerInput[] {
    return Object.entries(this.selectedAnswers()).map(([questionId, optionId]) => ({ questionId, optionId }));
  }

  private shareText(quiz: AnswerQuizItem): string {
    return `${quiz.title} - ${quiz.description}`;
  }

  private async copyShareText(text: string): Promise<void> {
    if (typeof document === 'undefined') {
      return;
    }

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // Fall through for browsers that expose Clipboard API but deny this call.
      }
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
}
