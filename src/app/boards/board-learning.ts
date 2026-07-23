export type BoardLearningCardSource = {
  id: string;
  title: string;
  subtitle: string;
  notes: string;
  shortSummary?: string;
  tags: string[];
};

export type BoardLearningQuizOption = {
  id: string;
  text: string;
};

export type BoardLearningQuizQuestion = {
  id: string;
  sourceCardId: string;
  sourceCardTitle: string;
  prompt: string;
  options: BoardLearningQuizOption[];
  correctOptionId: string;
  explanation: string;
};

export type BoardLearningQuiz = {
  id: string;
  title: string;
  description: string;
  published: boolean;
  questions: BoardLearningQuizQuestion[];
  createdAt: string;
  updatedAt: string;
};

export type BoardLearningQuizAnswer = {
  questionId: string;
  optionId: string;
};

export type BoardLearningQuizResult = {
  questionId: string;
  selectedOptionId: string | null;
  correctOptionId: string;
  correct: boolean;
  sourceCardId: string;
  explanation: string;
};

export type BoardLearningQuizGrade = {
  score: number;
  total: number;
  percent: number;
  results: BoardLearningQuizResult[];
};

export type BoardLearningQuizStats = {
  attemptCount: number;
  averagePercent: number;
  completionCount: number;
  difficultCards: Array<{
    cardId: string;
    title: string;
    attempts: number;
    correctPercent: number;
  }>;
};

const compact = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

function clueForCard(card: BoardLearningCardSource): string {
  const clue = compact(
    card.shortSummary || card.subtitle || card.notes || card.tags.join(', '),
    180,
  );
  if (!clue) {
    return '';
  }
  const title = compact(card.title, 120);
  if (!title) {
    return clue;
  }
  return compact(clue.replace(new RegExp(escapeRegExp(title), 'ig'), 'this card'), 180);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function optionId(cardId: string): string {
  return `option-${cardId}`.slice(0, 160);
}

export function boardQuizEligibleCardCount(cards: BoardLearningCardSource[]): number {
  return cards.filter((card) => compact(card.title, 120) && clueForCard(card)).length;
}

export function buildBoardLearningQuiz(
  board: { id: string; title: string; description: string; cards: BoardLearningCardSource[] },
  now = new Date().toISOString(),
): BoardLearningQuiz | null {
  const eligibleCards = board.cards
    .filter((card) => compact(card.title, 120) && clueForCard(card))
    .slice(0, 10);
  if (eligibleCards.length < 3) {
    return null;
  }

  const questions = eligibleCards.map((sourceCard, index): BoardLearningQuizQuestion => {
    const optionCards = [
      sourceCard,
      ...Array.from({ length: Math.min(3, eligibleCards.length - 1) }, (_, offset) =>
        eligibleCards[(index + offset + 1) % eligibleCards.length]),
    ];
    const correctPosition = index % optionCards.length;
    const rotatedOptions = [
      ...optionCards.slice(optionCards.length - correctPosition),
      ...optionCards.slice(0, optionCards.length - correctPosition),
    ];
    const clue = clueForCard(sourceCard);
    const explanation = compact(
      sourceCard.notes || sourceCard.shortSummary || sourceCard.subtitle || clue,
      280,
    );
    return {
      id: `question-${index + 1}`,
      sourceCardId: sourceCard.id,
      sourceCardTitle: compact(sourceCard.title, 120),
      prompt: `Which card matches this clue: “${clue}”?`,
      options: rotatedOptions.map((card) => ({
        id: optionId(card.id),
        text: compact(card.title, 120),
      })),
      correctOptionId: optionId(sourceCard.id),
      explanation: explanation
        ? `${sourceCard.title}: ${explanation}`
        : `The source card is ${sourceCard.title}.`,
    };
  });

  return {
    id: `board-quiz-${board.id}`.slice(0, 160),
    title: `${compact(board.title, 90)} Challenge`,
    description: compact(
      board.description || `Learn ${board.title} one card at a time.`,
      220,
    ),
    published: false,
    questions,
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeBoardLearningQuiz(value: unknown): BoardLearningQuiz | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const data = value as Record<string, unknown>;
  const questions = Array.isArray(data['questions'])
    ? data['questions']
        .map((question) => normalizeQuestion(question))
        .filter((question): question is BoardLearningQuizQuestion => !!question)
        .slice(0, 12)
    : [];
  const id = compact(data['id'], 160);
  const title = compact(data['title'], 120);
  if (!id || !title || questions.length < 1) {
    return null;
  }
  const createdAt = compact(data['createdAt'], 80) || new Date().toISOString();
  return {
    id,
    title,
    description: compact(data['description'], 300),
    published: data['published'] === true,
    questions,
    createdAt,
    updatedAt: compact(data['updatedAt'], 80) || createdAt,
  };
}

function normalizeQuestion(value: unknown): BoardLearningQuizQuestion | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const data = value as Record<string, unknown>;
  const options = Array.isArray(data['options'])
    ? data['options']
        .map((option) => normalizeOption(option))
        .filter((option): option is BoardLearningQuizOption => !!option)
        .slice(0, 4)
    : [];
  const id = compact(data['id'], 160);
  const sourceCardId = compact(data['sourceCardId'], 160);
  const prompt = compact(data['prompt'], 360);
  const correctOptionId = compact(data['correctOptionId'], 160);
  if (
    !id
    || !sourceCardId
    || !prompt
    || options.length < 2
    || !options.some((option) => option.id === correctOptionId)
  ) {
    return null;
  }
  return {
    id,
    sourceCardId,
    sourceCardTitle: compact(data['sourceCardTitle'], 120),
    prompt,
    options,
    correctOptionId,
    explanation: compact(data['explanation'], 500),
  };
}

function normalizeOption(value: unknown): BoardLearningQuizOption | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const data = value as Record<string, unknown>;
  const id = compact(data['id'], 160);
  const text = compact(data['text'], 160);
  return id && text ? { id, text } : null;
}

export function gradeBoardLearningQuiz(
  quiz: BoardLearningQuiz,
  answers: BoardLearningQuizAnswer[],
): BoardLearningQuizGrade {
  const selected = new Map(answers.map((answer) => [answer.questionId, answer.optionId]));
  const results = quiz.questions.map((question): BoardLearningQuizResult => {
    const selectedOptionId = selected.get(question.id) ?? null;
    return {
      questionId: question.id,
      selectedOptionId,
      correctOptionId: question.correctOptionId,
      correct: selectedOptionId === question.correctOptionId,
      sourceCardId: question.sourceCardId,
      explanation: question.explanation,
    };
  });
  const score = results.filter((result) => result.correct).length;
  return {
    score,
    total: results.length,
    percent: results.length ? Math.round((score / results.length) * 100) : 0,
    results,
  };
}
