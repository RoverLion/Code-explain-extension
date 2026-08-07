import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type * as vscode from 'vscode';
import type { LearningSession } from '../learningTypes';
import {
  loadQuestionBank,
  searchQuestions,
  setQuestionStarred,
  stableQuestionId,
  upsertQuestionsFromSession,
  upsertRegressionQuestionsFromGrade,
} from '../questionBankStore';
import type { RegressionPaper } from '../regressionTypes';
import type { GradeResult } from '../types';

function storageUri(dir: string): vscode.Uri {
  return { fsPath: dir } as vscode.Uri;
}

function sampleSession(overrides: Partial<LearningSession> = {}): LearningSession {
  return {
    id: 'session-1',
    at: '2026-08-06T10:00:00.000Z',
    filePath: '/src/foo.ts',
    languageId: 'typescript',
    title: 'Promises',
    summary: 'Promise basics',
    knowledge: [
      { id: 'k1', title: 'Async/Await', tags: ['async', 'javascript'] },
      { id: 'k2', title: 'Promises', tags: ['async'] },
    ],
    quizItems: [
      { id: 'q1', type: 'choice', pass: true, feedback: 'Good', stem: 'What is await?' },
      { id: 'q2', type: 'short', pass: false, feedback: 'Try again', stem: 'Explain a Promise.' },
    ],
    score: { correct: 1, total: 2, percent: 50 },
    ...overrides,
  };
}

test('stableQuestionId is stable across casing and whitespace but scoped by language and type', () => {
  const first = stableQuestionId(' TypeScript ', 'choice', '  What   is await? ');
  const normalized = stableQuestionId('typescript', 'choice', 'what is await?');

  assert.equal(first, normalized);
  assert.notEqual(first, stableQuestionId('javascript', 'choice', 'what is await?'));
  assert.notEqual(first, stableQuestionId('typescript', 'short', 'what is await?'));
});

test('upsertQuestionsFromSession persists questions without answers and grade results', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'question-bank-'));
  try {
    const bank = await upsertQuestionsFromSession(storageUri(dir), sampleSession());

    assert.equal(bank.version, 1);
    assert.equal(bank.questions.length, 2);
    assert.deepEqual(bank.questions[0].knowledgeTitles, ['Async/Await', 'Promises']);
    assert.deepEqual(bank.questions[0].tags, ['async', 'javascript']);
    assert.equal(bank.questions[0].starred, false);
    assert.deepEqual(bank.questions[0].lastResult, {
      pass: true,
      at: '2026-08-06T10:00:00.000Z',
    });
    assert.equal(bank.questions[0].sourceSessionId, 'session-1');
    assert.equal('feedback' in bank.questions[0], false);

    const persisted = JSON.parse(await readFile(path.join(dir, 'question-bank.json'), 'utf8'));
    assert.deepEqual(persisted, bank);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('upsert preserves starred and createdAt while updating latest result', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'question-bank-'));
  try {
    const uri = storageUri(dir);
    const first = await upsertQuestionsFromSession(uri, sampleSession());
    const id = first.questions[0].id;
    await setQuestionStarred(uri, id, true);

    const updated = await upsertQuestionsFromSession(
      uri,
      sampleSession({
        id: 'session-2',
        at: '2026-08-06T11:00:00.000Z',
        quizItems: [
          { id: 'q1-new', type: 'choice', pass: false, feedback: 'No', stem: ' what is   AWAIT? ' },
        ],
      }),
    );

    assert.equal(updated.questions.length, 2);
    const question = updated.questions.find((item) => item.id === id);
    assert.equal(question?.starred, true);
    assert.equal(question?.createdAt, first.questions[0].createdAt);
    assert.equal(question?.updatedAt, '2026-08-06T11:00:00.000Z');
    assert.deepEqual(question?.lastResult, { pass: false, at: '2026-08-06T11:00:00.000Z' });
    assert.equal(question?.sourceSessionId, 'session-2');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('setQuestionStarred updates a known question and leaves unknown ids unchanged', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'question-bank-'));
  try {
    const uri = storageUri(dir);
    const initial = await upsertQuestionsFromSession(uri, sampleSession());
    const starred = await setQuestionStarred(uri, initial.questions[1].id, true);
    assert.equal(starred.questions[1].starred, true);

    const unchanged = await setQuestionStarred(uri, 'missing', false);
    assert.deepEqual(unchanged, starred);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('searchQuestions combines language, tag, query, and starred filters', () => {
  const questions = [
    {
      id: '1',
      languageId: 'typescript',
      type: 'choice' as const,
      stem: 'What does await do?',
      knowledgeTitles: ['Async/Await'],
      tags: ['async'],
      starred: true,
      createdAt: '2026-08-06T10:00:00.000Z',
      updatedAt: '2026-08-06T10:00:00.000Z',
    },
    {
      id: '2',
      languageId: 'javascript',
      type: 'short' as const,
      stem: 'Explain closures',
      knowledgeTitles: ['Closures'],
      tags: ['scope'],
      starred: false,
      createdAt: '2026-08-06T11:00:00.000Z',
      updatedAt: '2026-08-06T11:00:00.000Z',
    },
  ];

  const bank = { version: 1 as const, questions };
  assert.deepEqual(searchQuestions(bank, { languageId: ' TYPESCRIPT ' }), [questions[0]]);
  assert.deepEqual(searchQuestions(bank, { tag: 'ASYNC', starredOnly: true }), [questions[0]]);
  assert.deepEqual(searchQuestions(bank, { query: 'closures' }), [questions[1]]);
  assert.deepEqual(searchQuestions(bank, { query: 'async/await' }), [questions[0]]);
  assert.deepEqual(searchQuestions(bank, { languageId: 'typescript', tag: 'scope' }), []);
});

test('upsertQuestionsFromSession keeps at most 500 questions and evicts oldest unstarred first', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'question-bank-'));
  try {
    const uri = storageUri(dir);
    const initialItems = Array.from({ length: 500 }, (_, index) => ({
      id: `q-${index}`,
      type: 'short' as const,
      pass: true,
      feedback: '',
      stem: `Question ${index}`,
    }));
    const initial = await upsertQuestionsFromSession(uri, sampleSession({ quizItems: initialItems }));
    await setQuestionStarred(uri, initial.questions[0].id, true);

    const updated = await upsertQuestionsFromSession(
      uri,
      sampleSession({
        id: 'session-2',
        at: '2026-08-06T11:00:00.000Z',
        quizItems: [{ id: 'new', type: 'short', pass: true, feedback: '', stem: 'Newest question' }],
      }),
    );

    assert.equal(updated.questions.length, 500);
    assert.equal(updated.questions.some((item) => item.stem === 'Question 0'), true);
    assert.equal(updated.questions.some((item) => item.stem === 'Question 1'), false);
    assert.equal(updated.questions.some((item) => item.stem === 'Newest question'), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadQuestionBank returns an empty bank when the file is missing', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'question-bank-'));
  try {
    assert.deepEqual(await loadQuestionBank(storageUri(dir)), { version: 1, questions: [] });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('upsertRegressionQuestionsFromGrade updates bank results and inserts AI code items', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'question-bank-'));
  try {
    const uri = storageUri(dir);
    const initial = await upsertQuestionsFromSession(uri, sampleSession());
    const existing = initial.questions[0];
    const paper: RegressionPaper = {
      id: 'paper-1',
      at: '2026-08-06T12:00:00.000Z',
      languageFilter: 'typescript',
      items: [
        {
          id: 'existing-result',
          source: 'bank',
          bankId: existing.id,
          languageId: existing.languageId,
          type: existing.type,
          stem: existing.stem,
          options: existing.options,
          knowledgeTitles: existing.knowledgeTitles,
        },
        {
          id: 'ai-code',
          source: 'ai',
          languageId: 'typescript',
          type: 'code',
          stem: 'Write an async retry helper.',
          knowledgeTitles: ['Async/Await', 'Retries'],
          tags: ['async'],
        },
      ],
    };
    const grade: GradeResult = {
      score: { correct: 1, total: 2, percent: 50 },
      items: [
        { id: 'existing-result', type: 'choice', pass: false, feedback: 'Review await.' },
        { id: 'ai-code', type: 'code', pass: true, feedback: 'Good retry loop.' },
      ],
    };

    const updated = await upsertRegressionQuestionsFromGrade(
      uri,
      paper,
      grade,
      'session-regression',
      '2026-08-06T12:30:00.000Z',
    );

    assert.equal(updated.questions.length, initial.questions.length + 1);
    assert.deepEqual(
      updated.questions.find((question) => question.id === existing.id)?.lastResult,
      { pass: false, at: '2026-08-06T12:30:00.000Z' },
    );
    const code = updated.questions.find((question) => question.stem === 'Write an async retry helper.');
    assert.equal(code?.type, 'code');
    assert.deepEqual(code?.knowledgeTitles, ['Async/Await', 'Retries']);
    assert.deepEqual(code?.tags, ['async']);
    assert.deepEqual(code?.lastResult, { pass: true, at: '2026-08-06T12:30:00.000Z' });
    assert.equal(code?.sourceSessionId, 'session-regression');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
