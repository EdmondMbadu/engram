import {
  boardQuizEligibleCardCount,
  buildBoardLearningQuiz,
  gradeBoardLearningQuiz,
  normalizeBoardLearningQuiz,
  type BoardLearningCardSource,
} from './board-learning';

describe('board learning', () => {
  const cards: BoardLearningCardSource[] = [
    { id: 'a', title: 'Mercury', subtitle: 'Closest planet to the Sun', notes: 'A small rocky world.', tags: [] },
    { id: 'b', title: 'Venus', subtitle: 'Hottest planet', notes: 'A thick atmosphere traps heat.', tags: [] },
    { id: 'c', title: 'Earth', subtitle: 'Our home planet', notes: 'The only known world with life.', tags: [] },
    { id: 'd', title: 'Mars', subtitle: 'The red planet', notes: 'Iron minerals color its surface.', tags: [] },
  ];

  it('builds card-linked questions with varied correct-answer positions', () => {
    const quiz = buildBoardLearningQuiz(
      { id: 'space', title: 'Planets', description: 'The inner planets', cards },
      '2026-07-23T00:00:00.000Z',
    );

    expect(quiz).not.toBeNull();
    expect(quiz?.questions.length).toBe(4);
    expect(new Set(quiz?.questions.map((question) =>
      question.options.findIndex((option) => option.id === question.correctOptionId),
    )).size).toBeGreaterThan(1);
    expect(quiz?.questions.every((question) =>
      cards.some((card) => card.id === question.sourceCardId),
    )).toBeTrue();
  });

  it('requires at least three cards with useful clues', () => {
    expect(boardQuizEligibleCardCount(cards.slice(0, 2))).toBe(2);
    expect(buildBoardLearningQuiz({ id: 'tiny', title: 'Tiny', description: '', cards: cards.slice(0, 2) })).toBeNull();
  });

  it('normalizes persisted quizzes and grades attempts', () => {
    const quiz = buildBoardLearningQuiz({ id: 'space', title: 'Planets', description: '', cards });
    const normalized = normalizeBoardLearningQuiz(quiz);
    expect(normalized).not.toBeNull();

    const grade = gradeBoardLearningQuiz(normalized!, normalized!.questions.map((question, index) => ({
      questionId: question.id,
      optionId: index === 0 ? question.correctOptionId : question.options.find((option) => option.id !== question.correctOptionId)!.id,
    })));
    expect(grade.score).toBe(1);
    expect(grade.total).toBe(4);
    expect(grade.results[0].sourceCardId).toBe('a');
  });
});
