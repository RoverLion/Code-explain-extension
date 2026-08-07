import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LearningProgressFile } from '../learningTypes';
import type { BankQuestion, QuestionBankFile } from '../questionBankTypes';
import {
  assembleRegressionPaper,
  listLearnedLanguageIds,
  pickBankItemsForRegression,
} from '../regressionAssembler';

function makeQuestion(overrides: Partial<BankQuestion> & Pick<BankQuestion, 'id'>): BankQuestion {
  return {
    languageId: 'typescript',
    type: 'short',
    stem: `Question ${overrides.id}`,
    knowledgeTitles: ['Generics'],
    starred: false,
    createdAt: '2026-08-06T10:00:00.000Z',
    updatedAt: '2026-08-06T10:00:00.000Z',
    ...overrides,
  };
}

const progress: LearningProgressFile = {
  version: 2,
  knowledgeStats: {
    'typescript|generics': {
      title: 'Generics',
      languageId: 'typescript',
      correct: 1,
      wrong: 3,
      lastAt: '2026-08-06T10:00:00.000Z',
      lastPass: false,
    },
    'typescript|promises': {
      title: 'Promises',
      languageId: 'typescript',
      correct: 0,
      wrong: 2,
      lastAt: '2026-08-06T10:00:00.000Z',
      lastPass: false,
    },
    'python|decorators': {
      title: 'Decorators',
      languageId: 'python',
      correct: 4,
      wrong: 0,
      lastAt: '2026-08-06T11:00:00.000Z',
      lastPass: true,
    },
  },
  sessions: [],
};

const bank: QuestionBankFile = {
  version: 1,
  questions: [
    makeQuestion({ id: 'weak-g1', knowledgeTitles: ['Generics'], starred: true }),
    makeQuestion({ id: 'weak-g2', knowledgeTitles: ['Generics'], starred: false }),
    makeQuestion({ id: 'weak-p1', knowledgeTitles: ['Promises'], starred: false }),
    makeQuestion({ id: 'strong-py', languageId: 'python', knowledgeTitles: ['Decorators'] }),
    makeQuestion({ id: 'neutral-ts', knowledgeTitles: ['Modules'], starred: false }),
    makeQuestion({ id: 'starred-neutral', knowledgeTitles: ['Modules'], starred: true }),
  ],
};

test('listLearnedLanguageIds unions progress and bank languages', () => {
  assert.deepEqual(listLearnedLanguageIds(progress, bank), ['python', 'typescript']);
});

test('pickBankItemsForRegression returns empty array for empty bank', () => {
  assert.deepEqual(
    pickBankItemsForRegression({
      bank: { version: 1, questions: [] },
      progress,
      languageFilter: 'all',
    }),
    [],
  );
});

test('pickBankItemsForRegression respects languageFilter for a specific language', () => {
  const picked = pickBankItemsForRegression({
    bank,
    progress,
    languageFilter: 'python',
    limit: 5,
  });
  assert.deepEqual(picked.map((item) => item.id), ['strong-py']);
});

test('pickBankItemsForRegression prioritizes weak knowledge before neutral tiers', () => {
  const picked = pickBankItemsForRegression({
    bank,
    progress,
    languageFilter: 'typescript',
    limit: 3,
  });
  const ids = picked.map((item) => item.id);
  assert.ok(ids.includes('weak-g1') || ids.includes('weak-g2'));
  assert.ok(ids.includes('weak-p1'));
  assert.ok(!ids.includes('starred-neutral'));
});

test('pickBankItemsForRegression diversifies knowledgeTitles before filling duplicates', () => {
  const picked = pickBankItemsForRegression({
    bank,
    progress,
    languageFilter: 'typescript',
    limit: 4,
  });
  const titles = picked.flatMap((item) => item.knowledgeTitles);
  assert.ok(titles.includes('Generics'));
  assert.ok(titles.includes('Promises'));
  assert.ok(titles.includes('Modules'));
});

test('pickBankItemsForRegression respects limit', () => {
  const picked = pickBankItemsForRegression({
    bank,
    progress,
    languageFilter: 'all',
    limit: 2,
  });
  assert.equal(picked.length, 2);
});

test('pickBankItemsForRegression prefers unstarred over starred when knowledge is not weak', () => {
  const localBank: QuestionBankFile = {
    version: 1,
    questions: [
      makeQuestion({ id: 'unstarred-modules', knowledgeTitles: ['Modules'], starred: false }),
      makeQuestion({ id: 'starred-modules', knowledgeTitles: ['Modules'], starred: true }),
    ],
  };
  const localProgress: LearningProgressFile = {
    version: 2,
    sessions: [],
    knowledgeStats: {},
  };
  const picked = pickBankItemsForRegression({
    bank: localBank,
    progress: localProgress,
    languageFilter: 'typescript',
    limit: 1,
  });
  assert.equal(picked[0]?.id, 'unstarred-modules');
});

test('assembleRegressionPaper generates only AI general items using topic seeds', async () => {
  let receivedPrompt = '';
  const generatedItems = Array.from({ length: 6 }, (_, index) => ({
    id: `ai-${index + 1}`,
    source: 'ai' as const,
    languageId: 'typescript',
    type: index === 0 ? ('code' as const) : ('short' as const),
    stem: `General practice ${index + 1}`,
    knowledgeTitles: ['Generics'],
  }));

  const paper = await assembleRegressionPaper({
    progress,
    bank,
    languageFilter: 'typescript',
    outputLanguage: 'zh-CN',
    generateAiItems: async (prompt) => {
      receivedPrompt = prompt;
      return {
        id: 'generated',
        at: '2026-08-06T12:00:00.000Z',
        languageFilter: 'typescript',
        items: generatedItems,
      };
    },
  });

  assert.equal(paper.items.length, 6);
  assert.ok(paper.items.every((item) => item.source === 'ai'));
  assert.equal(paper.items.filter((item) => item.type === 'code').length, 1);
  assert.equal(paper.languageFilter, 'typescript');
  assert.match(receivedPrompt, /Generics/);
  assert.match(receivedPrompt, /interview|general|reusable/i);
  assert.doesNotMatch(receivedPrompt, /Question weak-g1/);
  assert.doesNotMatch(receivedPrompt, /Existing stems/i);
});

test('assembleRegressionPaper uses six AI items with one code when bank is empty', async () => {
  let receivedPrompt = '';
  const generatedItems = Array.from({ length: 6 }, (_, index) => ({
    id: `ai-${index + 1}`,
    source: 'ai' as const,
    languageId: 'typescript',
    type: index === 0 ? ('code' as const) : ('short' as const),
    stem: `Generated ${index + 1}`,
    knowledgeTitles: ['Generics'],
  }));

  const paper = await assembleRegressionPaper({
    progress,
    bank: { version: 1, questions: [] },
    languageFilter: 'typescript',
    outputLanguage: 'en-US',
    generateAiItems: async (prompt) => {
      receivedPrompt = prompt;
      return {
        id: 'generated',
        at: '2026-08-06T12:00:00.000Z',
        languageFilter: 'typescript',
        items: generatedItems,
      };
    },
  });

  assert.equal(paper.items.length, 6);
  assert.ok(paper.items.every((item) => item.source === 'ai'));
  assert.equal(paper.items.filter((item) => item.type === 'code').length, 1);
  assert.match(receivedPrompt, /exactly 6/i);
  assert.match(receivedPrompt, /exactly 1.*code/i);
});
