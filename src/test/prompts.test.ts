import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildExplainPrompt,
  buildGradePrompt,
  buildRegressionGradePrompt,
  buildRegressionPaperPrompt,
} from '../prompts';
import type { RegressionPaper } from '../regressionTypes';
import type { ExplainResult } from '../types';

const EXPLAIN_FIXTURE = {
  workspaceRoot: '/repo',
  filePath: 'src/a.ts',
  languageId: 'typescript',
  selectionText: 'const x = 1;',
  selectionRange: { startLine: 10, endLine: 10, startCharacter: 0, endCharacter: 12 },
  fileText: 'const x = 1;\n',
};

test('buildExplainPrompt includes selection and schema reminder', () => {
  const p = buildExplainPrompt(EXPLAIN_FIXTURE, 'zh-CN');
  assert.match(p, /typescript/);
  assert.match(p, /src\/a\.ts/);
  assert.match(p, /const x = 1/);
  assert.match(p, /JSON/);
  assert.match(p, /related|import|依赖|检索/i);
});

test('buildExplainPrompt requires ExplainResult-only JSON and quiz constraints', () => {
  const p = buildExplainPrompt(
    {
      workspaceRoot: '/repo',
      filePath: 'src/a.ts',
      languageId: 'typescript',
      selectionText: 'x',
      selectionRange: { startLine: 0, endLine: 0, startCharacter: 0, endCharacter: 1 },
    },
    'zh-CN',
  );
  assert.match(p, /ExplainResult/i);
  assert.match(p, /line/i);
  assert.match(p, /3.*5|3-5|3～5|1–5|1-5/i);
  assert.match(p, /prefer|允许|allowed|1/i);
  assert.match(p, /correct|answer|正确答案|answer keys|reveals?/i);
});

test('buildGradePrompt includes stems, answers, summary, and GradeResult JSON constraint', () => {
  const explain: ExplainResult = {
    meta: {
      title: 'Demo',
      languageId: 'typescript',
      filePath: 'src/a.ts',
      summary: 'Declares a constant.',
    },
    lines: [{ line: 1, code: 'const x = 1;', meaning: 'Defines x.' }],
    knowledge: [{ id: 'k1', title: 'const', body: 'Block-scoped binding.' }],
    quiz: {
      choices: [
        { id: 'c1', stem: 'What does const do?', options: ['a', 'b', 'c', 'd'] },
        { id: 'c2', stem: 'Scope of x?', options: ['a', 'b', 'c', 'd'] },
        { id: 'c3', stem: 'Type of 1?', options: ['a', 'b', 'c', 'd'] },
      ],
      shorts: [{ id: 's1', stem: 'Explain x.', hint: 'Keep it short.' }],
    },
  };
  const p = buildGradePrompt({
    explain,
    answers: { choices: { c1: 0, c2: 1, c3: 2 }, shorts: { s1: 'A number constant' } },
    outputLanguage: 'zh-CN',
  });
  assert.match(p, /GradeResult/i);
  assert.match(p, /JSON/);
  assert.match(p, /What does const do/);
  assert.match(p, /Explain x/);
  assert.match(p, /Declares a constant/);
  assert.match(p, /\[c1\]/);
  assert.match(p, /User answer: 0: a/);
  assert.match(p, /A number constant/);
  assert.match(p, /feedback/i);
  assert.match(p, /semantic|语义/i);
});

test('buildExplainPrompt and buildGradePrompt include en-US language directive', () => {
  const directive =
    'Write all user-facing natural language fields in en-US (JSON keys stay English).';

  const explainPrompt = buildExplainPrompt(EXPLAIN_FIXTURE, 'en-US');
  assert.match(explainPrompt, new RegExp(directive.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  const explain: ExplainResult = {
    meta: {
      title: 'Demo',
      languageId: 'typescript',
      filePath: 'src/a.ts',
      summary: 'Declares a constant.',
    },
    lines: [{ line: 1, code: 'const x = 1;', meaning: 'Defines x.' }],
    knowledge: [{ id: 'k1', title: 'const', body: 'Block-scoped binding.' }],
    quiz: {
      choices: [{ id: 'c1', stem: 'What does const do?', options: ['a', 'b', 'c', 'd'] }],
      shorts: [{ id: 's1', stem: 'Explain x.' }],
    },
  };
  const gradePrompt = buildGradePrompt({
    explain,
    answers: { choices: { c1: 0 }, shorts: { s1: 'A constant' } },
    outputLanguage: 'en-US',
  });
  assert.match(gradePrompt, new RegExp(directive.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('buildRegressionPaperPrompt requires general interview-style questions from topic seeds', () => {
  const prompt = buildRegressionPaperPrompt({
    languages: ['typescript'],
    topicSeeds: ['Generics'],
    outputLanguage: 'zh-CN',
    count: 6,
  });

  assert.match(prompt, /typescript/);
  assert.match(prompt, /Generics/);
  assert.match(prompt, /exactly 6/i);
  assert.match(prompt, /exactly 1.*code/i);
  assert.match(prompt, /interview|general|reusable/i);
  assert.match(prompt, /business API|project|codebase|proprietary/i);
  assert.match(prompt, /zh-CN/);
  assert.match(prompt, /only.*JSON|JSON.*only/i);
  assert.doesNotMatch(prompt, /Existing stems/i);
});

test('buildRegressionPaperPrompt still works with empty topic seeds', () => {
  const prompt = buildRegressionPaperPrompt({
    languages: ['python'],
    topicSeeds: [],
    outputLanguage: 'en-US',
    count: 6,
  });

  assert.match(prompt, /exactly 6/i);
  assert.match(prompt, /exactly 1.*code/i);
  assert.match(prompt, /foundational|practical/i);
});

test('buildRegressionGradePrompt includes every answer, knowledge context, and code type', () => {
  const paper: RegressionPaper = {
    id: 'paper-1',
    at: '2026-08-06T10:00:00.000Z',
    languageFilter: 'typescript',
    items: [
      {
        id: 'choice-1',
        source: 'bank',
        bankId: 'bank-1',
        languageId: 'typescript',
        type: 'choice',
        stem: 'What does await do?',
        options: ['Blocks a thread', 'Waits for a promise', 'Creates a class'],
        knowledgeTitles: ['Async/Await'],
      },
      {
        id: 'code-1',
        source: 'ai',
        languageId: 'typescript',
        type: 'code',
        stem: 'Write a function that awaits two promises.',
        knowledgeTitles: ['Promises'],
      },
    ],
  };

  const prompt = buildRegressionGradePrompt({
    paper,
    answers: {
      choices: { 'choice-1': 1 },
      texts: { 'code-1': 'async function both(a, b) { return Promise.all([a, b]); }' },
    },
    outputLanguage: 'zh-CN',
  });

  assert.match(prompt, /Regression|GradeResult/i);
  assert.match(prompt, /"choice".*"short".*"code"/s);
  assert.match(prompt, /What does await do/);
  assert.match(prompt, /1: Waits for a promise/);
  assert.match(prompt, /Write a function/);
  assert.match(prompt, /Promise\.all/);
  assert.match(prompt, /Async\/Await/);
  assert.match(prompt, /Promises/);
  assert.match(prompt, /semantic|语义/i);
  assert.match(prompt, /do not execute|不.*执行/i);
  assert.match(prompt, /zh-CN/);
});
