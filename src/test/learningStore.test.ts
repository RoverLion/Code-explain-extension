import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type * as vscode from 'vscode';
import type { RecordLearningSessionInput } from '../learningTypes';
import {
  applySessionToStats,
  clearLearningProgress,
  knowledgeStatKey,
  loadLearningProgress,
  migrateProgressToV2,
  normalizeKnowledgeKey,
  recordLearningSession,
  truncateSessions,
} from '../learningStore';

function storageUri(dir: string): vscode.Uri {
  return { fsPath: dir } as vscode.Uri;
}

function sampleInput(overrides: Partial<RecordLearningSessionInput> = {}): RecordLearningSessionInput {
  return {
    filePath: '/src/foo.ts',
    languageId: 'typescript',
    title: 'Sample',
    summary: 'A sample session',
    knowledge: [{ id: 'k1', title: 'Async/Await', tags: ['js'] }],
    quizItems: [
      { id: 'q1', type: 'choice', pass: true, feedback: 'Good', stem: 'What is await?' },
    ],
    score: { correct: 3, total: 5, percent: 60 },
    ...overrides,
  };
}

test('normalizeKnowledgeKey trims and lowercases', () => {
  assert.equal(normalizeKnowledgeKey('  Hello World  '), 'hello world');
  assert.equal(normalizeKnowledgeKey('TypeScript'), 'typescript');
  assert.equal(normalizeKnowledgeKey(''), '');
});

test('knowledgeStatKey scopes normalized titles by normalized language', () => {
  assert.equal(knowledgeStatKey(' TypeScript ', '  Async/Await  '), 'typescript|async/await');
  assert.notEqual(knowledgeStatKey('typescript', 'Promises'), knowledgeStatKey('javascript', 'Promises'));
});

test('applySessionToStats increments correct when percent >= 60', () => {
  const at = '2026-08-06T10:00:00.000Z';
  const knowledge = [{ id: 'k1', title: 'Async/Await', tags: ['js'] }];
  const result = applySessionToStats({}, 'typescript', knowledge, 60, at);

  assert.equal(result['typescript|async/await'].correct, 1);
  assert.equal(result['typescript|async/await'].wrong, 0);
  assert.equal(result['typescript|async/await'].lastPass, true);
  assert.equal(result['typescript|async/await'].lastAt, at);
  assert.equal(result['typescript|async/await'].title, 'Async/Await');
  assert.equal(result['typescript|async/await'].languageId, 'typescript');
  assert.deepEqual(result['typescript|async/await'].tags, ['js']);
});

test('applySessionToStats increments wrong when percent < 60', () => {
  const at = '2026-08-06T10:00:00.000Z';
  const knowledge = [{ id: 'k1', title: 'Closures' }];
  const result = applySessionToStats({}, 'typescript', knowledge, 59, at);

  assert.equal(result['typescript|closures'].correct, 0);
  assert.equal(result['typescript|closures'].wrong, 1);
  assert.equal(result['typescript|closures'].lastPass, false);
});

test('applySessionToStats accumulates on existing stats', () => {
  const at = '2026-08-06T11:00:00.000Z';
  const existing = {
    'typescript|closures': {
      title: 'Closures',
      languageId: 'typescript',
      correct: 2,
      wrong: 1,
      lastAt: '2026-08-06T09:00:00.000Z',
      lastPass: true,
    },
  };
  const result = applySessionToStats(existing, 'typescript', [{ id: 'k1', title: 'Closures' }], 40, at);

  assert.equal(result['typescript|closures'].correct, 2);
  assert.equal(result['typescript|closures'].wrong, 2);
  assert.equal(result['typescript|closures'].lastPass, false);
  assert.equal(result['typescript|closures'].lastAt, at);
});

test('applySessionToStats merges keys with different casing', () => {
  const first = applySessionToStats({}, 'TypeScript', [{ id: 'k1', title: 'Promises' }], 80, '2026-08-06T09:00:00.000Z');
  const second = applySessionToStats(first, '  TYPESCRIPT  ', [{ id: 'k2', title: '  PROMISES  ' }], 50, '2026-08-06T10:00:00.000Z');

  assert.equal(Object.keys(second).length, 1);
  assert.equal(second['typescript|promises'].correct, 1);
  assert.equal(second['typescript|promises'].wrong, 1);
});

test('applySessionToStats keeps same title in different languages separate', () => {
  const first = applySessionToStats({}, 'typescript', [{ id: 'k1', title: 'Closures' }], 80, '2026-08-06T09:00:00.000Z');
  const second = applySessionToStats(first, 'javascript', [{ id: 'k2', title: 'Closures' }], 80, '2026-08-06T10:00:00.000Z');

  assert.deepEqual(Object.keys(second).sort(), ['javascript|closures', 'typescript|closures']);
});

test('truncateSessions keeps most recent max sessions', () => {
  const sessions = Array.from({ length: 105 }, (_, i) => ({
    id: `id-${i}`,
    at: new Date(i).toISOString(),
    filePath: '/a.ts',
    languageId: 'ts',
    title: `Session ${i}`,
    summary: '',
    knowledge: [],
    quizItems: [],
    score: { correct: 1, total: 1, percent: 100 },
  }));
  const truncated = truncateSessions(sessions, 100);

  assert.equal(truncated.length, 100);
  assert.equal(truncated[0].id, 'id-5');
  assert.equal(truncated[99].id, 'id-104');
});

test('truncateSessions returns all when under max', () => {
  const sessions = [{ id: 'only', at: '2026-01-01T00:00:00.000Z', filePath: '/a.ts', languageId: 'ts', title: 'One', summary: '', knowledge: [], quizItems: [], score: { correct: 1, total: 1, percent: 100 } }];
  assert.equal(truncateSessions(sessions).length, 1);
});

test('loadLearningProgress returns empty default when file missing', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'learning-store-'));
  try {
    const result = await loadLearningProgress(storageUri(dir));
    assert.deepEqual(result, { version: 2, sessions: [], knowledgeStats: {} });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('recordLearningSession persists session and updates stats', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'learning-store-'));
  try {
    const uri = storageUri(dir);
    const saved = await recordLearningSession(uri, sampleInput({ score: { correct: 4, total: 5, percent: 80 } }));

    assert.equal(saved.version, 2);
    assert.equal(saved.sessions.length, 1);
    assert.match(saved.sessions[0].id, /^[0-9a-f-]{36}$/);
    assert.match(saved.sessions[0].at, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(saved.knowledgeStats['typescript|async/await'].correct, 1);
    assert.equal(saved.knowledgeStats['typescript|async/await'].wrong, 0);
    assert.equal(saved.knowledgeStats['typescript|async/await'].languageId, 'typescript');

    const loaded = await loadLearningProgress(uri);
    assert.deepEqual(loaded, saved);

    const raw = JSON.parse(await readFile(path.join(dir, 'learning-progress.json'), 'utf8'));
    assert.equal(raw.sessions.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('migrateProgressToV2 rebuilds stats by session language and preserves unmatched v1 stats as unknown', () => {
  const firstSession = {
    id: 'session-1',
    at: '2026-08-06T09:00:00.000Z',
    ...sampleInput({ languageId: 'typescript', score: { correct: 3, total: 5, percent: 60 } }),
  };
  const secondSession = {
    id: 'session-2',
    at: '2026-08-06T10:00:00.000Z',
    ...sampleInput({ languageId: 'javascript', score: { correct: 2, total: 5, percent: 40 } }),
  };
  const migrated = migrateProgressToV2({
    version: 1,
    sessions: [firstSession, secondSession],
    knowledgeStats: {
      'async/await': {
        title: 'Async/Await',
        tags: ['js'],
        correct: 10,
        wrong: 4,
        lastAt: secondSession.at,
        lastPass: false,
      },
      orphaned: {
        title: 'Orphaned',
        correct: 2,
        wrong: 1,
        lastAt: firstSession.at,
        lastPass: true,
      },
    },
  });

  assert.equal(migrated.version, 2);
  assert.equal(migrated.knowledgeStats['typescript|async/await'].correct, 1);
  assert.equal(migrated.knowledgeStats['javascript|async/await'].wrong, 1);
  assert.equal(migrated.knowledgeStats['unknown|orphaned'].languageId, 'unknown');
  assert.equal(migrated.knowledgeStats['unknown|orphaned'].correct, 2);
});

test('loadLearningProgress migrates and persists a v1 file as v2', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'learning-store-'));
  try {
    const session = {
      id: 'session-1',
      at: '2026-08-06T09:00:00.000Z',
      ...sampleInput(),
    };
    const filePath = path.join(dir, 'learning-progress.json');
    await writeFile(filePath, JSON.stringify({
      version: 1,
      sessions: [session],
      knowledgeStats: {},
    }), 'utf8');

    const loaded = await loadLearningProgress(storageUri(dir));
    const persisted = JSON.parse(await readFile(filePath, 'utf8'));

    assert.equal(loaded.version, 2);
    assert.equal(loaded.knowledgeStats['typescript|async/await'].correct, 1);
    assert.deepEqual(persisted, loaded);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('recordLearningSession truncates to 100 sessions', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'learning-store-'));
  try {
    const uri = storageUri(dir);
    for (let i = 0; i < 101; i++) {
      await recordLearningSession(uri, sampleInput({ title: `Session ${i}` }));
    }
    const loaded = await loadLearningProgress(uri);
    assert.equal(loaded.sessions.length, 100);
    assert.equal(loaded.sessions[0].title, 'Session 1');
    assert.equal(loaded.sessions[99].title, 'Session 100');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('clearLearningProgress resets file', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'learning-store-'));
  try {
    const uri = storageUri(dir);
    await recordLearningSession(uri, sampleInput());
    await clearLearningProgress(uri);

    const loaded = await loadLearningProgress(uri);
    assert.deepEqual(loaded, { version: 2, sessions: [], knowledgeStats: {} });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
