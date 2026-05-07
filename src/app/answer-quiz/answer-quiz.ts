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
}
