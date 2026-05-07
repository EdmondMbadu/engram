import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import type {
  AnswerQuizGrade,
  AnswerQuizItem,
  AnswerQuizLeaderboardItem,
  AnswerQuizOptionItem,
  AnswerQuizQuestionItem,
} from './atlas.models';
import { getFirebaseFunctions } from './firebase.client';

export interface QuizAnswerInput {
  questionId: string;
  optionId: string;
}

@Injectable({ providedIn: 'root' })
export class AnswerQuizService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly functions = this.isBrowser ? getFirebaseFunctions() : null;

  async createQuizFromAnswerCard(cardId: string): Promise<AnswerQuizItem> {
    const callable = httpsCallable(this.requireFunctions(), 'createAnswerQuiz');
    const result = await callable({ cardId });
    return this.hydrateQuiz((result.data as { quiz?: unknown }).quiz);
  }

  async getQuiz(quizId: string): Promise<AnswerQuizItem> {
    const callable = httpsCallable(this.requireFunctions(), 'getAnswerQuiz');
    const result = await callable({ quizId });
    return this.hydrateQuiz((result.data as { quiz?: unknown }).quiz);
  }

  async gradeAttempt(quizId: string, answers: QuizAnswerInput[]): Promise<AnswerQuizGrade> {
    const callable = httpsCallable(this.requireFunctions(), 'gradeAnswerQuizAttempt');
    const result = await callable({ quizId, answers });
    return this.hydrateGrade((result.data as { grade?: unknown }).grade);
  }

  async submitScore(
    quizId: string,
    answers: QuizAnswerInput[],
    elapsedMs: number,
  ): Promise<{ grade: AnswerQuizGrade; leaderboard: AnswerQuizLeaderboardItem[]; savedBest: boolean }> {
    const callable = httpsCallable(this.requireFunctions(), 'submitAnswerQuizScore');
    const result = await callable({ quizId, answers, elapsedMs });
    const data = result.data as Record<string, unknown>;
    return {
      grade: this.hydrateGrade(data['grade']),
      leaderboard: this.hydrateLeaderboard(data['leaderboard']),
      savedBest: data['savedBest'] === true,
    };
  }

  private hydrateQuiz(value: unknown): AnswerQuizItem {
    if (!value || typeof value !== 'object') {
      throw new Error('Quiz response was invalid.');
    }

    const data = value as Record<string, unknown>;
    const questions = Array.isArray(data['questions'])
      ? data['questions'].map((item) => this.hydrateQuestion(item)).filter((item): item is AnswerQuizQuestionItem => !!item)
      : [];

    return {
      id: String(data['id'] ?? ''),
      answerCardId: String(data['answerCardId'] ?? ''),
      atlasId: typeof data['atlasId'] === 'string' ? data['atlasId'] : null,
      atlasName: typeof data['atlasName'] === 'string' ? data['atlasName'] : null,
      title: String(data['title'] ?? 'Philly Knowledge Challenge'),
      description: String(data['description'] ?? 'Test what you picked up from this Living Wiki Philly answer.'),
      sourceQuestion: String(data['sourceQuestion'] ?? ''),
      questionCount: Number(data['questionCount'] ?? questions.length) || questions.length,
      questions,
      leaderboard: this.hydrateLeaderboard(data['leaderboard']),
      createdAt: typeof data['createdAt'] === 'string' ? data['createdAt'] : null,
      updatedAt: typeof data['updatedAt'] === 'string' ? data['updatedAt'] : null,
    };
  }

  private hydrateQuestion(value: unknown): AnswerQuizQuestionItem | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const data = value as Record<string, unknown>;
    const id = String(data['id'] ?? '').trim();
    const prompt = String(data['prompt'] ?? '').trim();
    const options = Array.isArray(data['options'])
      ? data['options'].map((item) => this.hydrateOption(item)).filter((item): item is AnswerQuizOptionItem => !!item)
      : [];
    return id && prompt && options.length > 0 ? { id, prompt, options } : null;
  }

  private hydrateOption(value: unknown): AnswerQuizOptionItem | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const data = value as Record<string, unknown>;
    const id = String(data['id'] ?? '').trim();
    const text = String(data['text'] ?? '').trim();
    return id && text ? { id, text } : null;
  }

  private hydrateGrade(value: unknown): AnswerQuizGrade {
    const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    return {
      score: Number(data['score'] ?? 0) || 0,
      total: Number(data['total'] ?? 0) || 0,
      percent: Number(data['percent'] ?? 0) || 0,
      results: Array.isArray(data['results'])
        ? data['results'].map((item) => {
            const result = item && typeof item === 'object' ? item as Record<string, unknown> : {};
            return {
              questionId: String(result['questionId'] ?? ''),
              selectedOptionId: typeof result['selectedOptionId'] === 'string' ? result['selectedOptionId'] : null,
              correctOptionId: String(result['correctOptionId'] ?? ''),
              correct: result['correct'] === true,
              explanation: String(result['explanation'] ?? ''),
            };
          })
        : [],
    };
  }

  private hydrateLeaderboard(value: unknown): AnswerQuizLeaderboardItem[] {
    return Array.isArray(value)
      ? value.map((item) => {
          const data = item && typeof item === 'object' ? item as Record<string, unknown> : {};
          return {
            rank: Number(data['rank'] ?? 0) || 0,
            displayName: String(data['displayName'] ?? 'Living Wiki Player'),
            score: Number(data['score'] ?? 0) || 0,
            total: Number(data['total'] ?? 0) || 0,
            percent: Number(data['percent'] ?? 0) || 0,
            elapsedMs: Number(data['elapsedMs'] ?? 0) || 0,
            attempts: Number(data['attempts'] ?? 1) || 1,
            updatedAt: typeof data['updatedAt'] === 'string' ? data['updatedAt'] : null,
          };
        })
      : [];
  }

  private requireFunctions() {
    if (!this.functions) {
      throw new Error('Firebase Functions is unavailable in this environment.');
    }
    return this.functions;
  }
}
