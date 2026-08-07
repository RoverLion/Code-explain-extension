import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractJsonObject, parseExplainResult, parseGradeResult, parseRegressionPaper } from '../schema';

const choice = (id: string) => ({
  id,
  stem: `Question ${id}`,
  options: ['a', 'b', 'c', 'd'],
});

const validExplainPayload = (choicesCount: number) => ({
  meta: { title: 't', languageId: 'ts', filePath: 'a.ts', summary: 's' },
  lines: [{ line: 1, code: 'x', meaning: 'y' }],
  knowledge: [{ id: 'k1', title: 'K', body: 'B' }],
  quiz: {
    choices: Array.from({ length: choicesCount }, (_, i) => choice(`c${i + 1}`)),
    shorts: [{ id: 's1', stem: 'S' }],
  },
});

test('extractJsonObject parses fenced json', () => {
  const payload = validExplainPayload(3);
  const raw = `here\n\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``;
  const obj = extractJsonObject(raw);
  const result = parseExplainResult(obj);
  assert.equal(result.meta.title, 't');
  assert.equal(result.quiz.choices.length, 3);
  assert.equal(result.quiz.shorts.length, 1);
});

test('parseExplainResult rejects missing quiz', () => {
  assert.throws(() => parseExplainResult({ meta: {}, lines: [], knowledge: [] }));
});

test('parseExplainResult accepts 1–5 choices', () => {
  assert.equal(parseExplainResult(validExplainPayload(1)).quiz.choices.length, 1);
  assert.equal(parseExplainResult(validExplainPayload(2)).quiz.choices.length, 2);
  assert.equal(parseExplainResult(validExplainPayload(5)).quiz.choices.length, 5);
});

test('parseExplainResult rejects fewer than 1 choice', () => {
  assert.throws(
    () => parseExplainResult(validExplainPayload(0)),
    /quiz\.choices must contain at least 1 item/,
  );
});

test('parseExplainResult rejects more than 5 choices', () => {
  assert.throws(
    () => parseExplainResult(validExplainPayload(6)),
    /quiz\.choices must contain at most 5 items/,
  );
});

test('parseGradeResult accepts valid payload', () => {
  const result = parseGradeResult({
    score: { correct: 2, total: 3, percent: 67 },
    items: [
      { id: 'c1', type: 'choice', pass: true, feedback: 'Correct' },
      { id: 's1', type: 'short', pass: false, feedback: 'Needs work' },
    ],
  });
  assert.equal(result.score.correct, 2);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].type, 'choice');
});

test('parseGradeResult rejects invalid item type', () => {
  assert.throws(
    () =>
      parseGradeResult({
        score: { correct: 0, total: 1, percent: 0 },
        items: [{ id: 'x1', type: 'essay', pass: false, feedback: 'N/A' }],
      }),
    /Invalid type at items\[0\]/,
  );
});

test('parseGradeResult accepts code item type', () => {
  const result = parseGradeResult({
    score: { correct: 1, total: 1, percent: 100 },
    items: [{ id: 'code1', type: 'code', pass: true, feedback: 'Good implementation' }],
  });
  assert.equal(result.items[0].type, 'code');
  assert.equal(result.items[0].pass, true);
});

const validRegressionPaper = () => ({
  id: 'paper-1',
  at: '2026-08-06T08:00:00.000Z',
  languageFilter: 'typescript' as string,
  items: [
    {
      id: 'b1',
      source: 'bank' as const,
      bankId: 'bank-q1',
      languageId: 'typescript',
      type: 'choice' as const,
      stem: 'Pick one',
      options: ['a', 'b', 'c', 'd'],
      knowledgeTitles: ['Variables'],
    },
    {
      id: 'a1',
      source: 'ai' as const,
      languageId: 'typescript',
      type: 'short' as const,
      stem: 'Explain let vs const',
      knowledgeTitles: ['Variables'],
      tags: ['basics'],
    },
    {
      id: 'a2',
      source: 'ai' as const,
      languageId: 'typescript',
      type: 'code' as const,
      stem: 'Write a function that sums two numbers',
      knowledgeTitles: ['Functions'],
    },
  ],
});

test('parseRegressionPaper accepts valid payload with choice, short, and code', () => {
  const result = parseRegressionPaper(validRegressionPaper());
  assert.equal(result.id, 'paper-1');
  assert.equal(result.languageFilter, 'typescript');
  assert.equal(result.items.length, 3);
  assert.equal(result.items[0].source, 'bank');
  assert.equal(result.items[0].bankId, 'bank-q1');
  assert.deepEqual(result.items[0].options, ['a', 'b', 'c', 'd']);
  assert.equal(result.items[2].type, 'code');
  assert.deepEqual(result.items[1].tags, ['basics']);
});

test('parseRegressionPaper accepts languageFilter all', () => {
  const payload = validRegressionPaper();
  payload.languageFilter = 'all';
  const result = parseRegressionPaper(payload);
  assert.equal(result.languageFilter, 'all');
});

test('parseRegressionPaper rejects missing items', () => {
  const payload = validRegressionPaper();
  delete (payload as { items?: unknown }).items;
  assert.throws(() => parseRegressionPaper(payload), /Missing items/);
});

test('parseRegressionPaper rejects empty items', () => {
  const payload = validRegressionPaper();
  payload.items = [];
  assert.throws(() => parseRegressionPaper(payload), /at least 1 item/);
});

test('parseRegressionPaper requires bankId when source is bank', () => {
  const payload = validRegressionPaper();
  delete payload.items[0].bankId;
  assert.throws(
    () => parseRegressionPaper(payload),
    /Missing string field: items\[0\]\.bankId|Invalid or missing string field: items\[0\]\.bankId/,
  );
});

test('parseRegressionPaper rejects bankId when source is ai', () => {
  const payload = validRegressionPaper();
  payload.items[1].bankId = 'unexpected';
  assert.throws(
    () => parseRegressionPaper(payload),
    /Unexpected bankId at items\[1\] when source is ai/,
  );
});

test('parseRegressionPaper requires options for choice type', () => {
  const payload = validRegressionPaper();
  delete payload.items[0].options;
  assert.throws(
    () => parseRegressionPaper(payload),
    /Missing options at items\[0\] for choice type/,
  );
});
