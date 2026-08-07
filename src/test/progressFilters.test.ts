import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LearningProgressFile } from '../learningTypes';
import type { QuestionBankFile } from '../questionBankTypes';
import {
  collectProgressFilterOptions,
  filterKnowledgeStats,
  filterLearningSessions,
  filterQuestionBank,
} from '../progressFilters';

const progress: LearningProgressFile = {
  version: 2,
  knowledgeStats: {
    'typescript|generics': {
      title: 'Generics',
      languageId: 'typescript',
      tags: ['types'],
      correct: 1,
      wrong: 3,
      lastAt: '2026-08-06T10:00:00.000Z',
      lastPass: false,
    },
    'python|decorators': {
      title: 'Decorators',
      languageId: 'python',
      tags: ['functions'],
      correct: 3,
      wrong: 1,
      lastAt: '2026-08-06T11:00:00.000Z',
      lastPass: true,
    },
  },
  sessions: [
    {
      id: 'ts-session',
      at: '2026-08-06T10:00:00.000Z',
      filePath: 'src/example.ts',
      languageId: 'typescript',
      title: 'Generic helper',
      summary: 'Uses generic type parameters.',
      knowledge: [{ id: 'k1', title: 'Generics', tags: ['types'] }],
      quizItems: [],
      score: { correct: 1, total: 2, percent: 50 },
    },
    {
      id: 'py-session',
      at: '2026-08-06T11:00:00.000Z',
      filePath: 'src/example.py',
      languageId: 'python',
      title: 'Decorator helper',
      summary: 'Wraps functions.',
      knowledge: [{ id: 'k2', title: 'Decorators', tags: ['functions'] }],
      quizItems: [],
      score: { correct: 2, total: 2, percent: 100 },
    },
  ],
};

const bank: QuestionBankFile = {
  version: 1,
  questions: [
    {
      id: 'q1',
      languageId: 'typescript',
      type: 'short',
      stem: 'How do generic constraints work?',
      knowledgeTitles: ['Generics'],
      tags: ['types'],
      starred: true,
      createdAt: '2026-08-06T10:00:00.000Z',
      updatedAt: '2026-08-06T10:00:00.000Z',
      lastResult: { pass: false, at: '2026-08-06T10:00:00.000Z' },
    },
    {
      id: 'q2',
      languageId: 'python',
      type: 'choice',
      stem: 'What does a decorator wrap?',
      options: ['A function', 'A number'],
      knowledgeTitles: ['Decorators'],
      tags: ['functions'],
      starred: false,
      createdAt: '2026-08-06T11:00:00.000Z',
      updatedAt: '2026-08-06T11:00:00.000Z',
    },
  ],
};

test('progress filters match language, tag and keyword case-insensitively', () => {
  const filters = { languageId: 'TYPESCRIPT', tag: 'types', query: 'generic' };

  assert.deepEqual(filterKnowledgeStats(progress.knowledgeStats, filters).map(({ title }) => title), [
    'Generics',
  ]);
  assert.deepEqual(filterLearningSessions(progress.sessions, filters).map(({ id }) => id), [
    'ts-session',
  ]);
});

test('question bank filter delegates to question bank search semantics', () => {
  assert.deepEqual(
    filterQuestionBank(bank, { languageId: 'typescript', tag: 'types', query: 'constraint' })
      .map(({ id }) => id),
    ['q1'],
  );
});

test('filter options combine languages globally and scope tags to selected language', () => {
  assert.deepEqual(collectProgressFilterOptions(progress, bank), {
    languages: ['python', 'typescript'],
    tags: [],
  });
  assert.deepEqual(collectProgressFilterOptions(progress, bank, 'typescript'), {
    languages: ['python', 'typescript'],
    tags: ['types'],
  });
  assert.deepEqual(collectProgressFilterOptions(progress, bank, 'python'), {
    languages: ['python', 'typescript'],
    tags: ['functions'],
  });
});
