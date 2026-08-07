import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type * as vscode from 'vscode';
import type { LearningSession } from './learningTypes';
import {
  emptyQuestionBank,
  type BankQuestion,
  type BankQuestionType,
  type QuestionBankFile,
  type QuestionSearchFilters,
} from './questionBankTypes';
import type { ExplainResult, GradeResult } from './types';
import type { RegressionPaper } from './regressionTypes';

const QUESTION_BANK_FILENAME = 'question-bank.json';
const DEFAULT_MAX_QUESTIONS = 500;

interface UpsertQuestion {
  type: BankQuestionType;
  stem: string;
  options?: string[];
  pass?: boolean;
}

/**
 * Upsert questions under a single languageId.
 * Tags are stored on each question and are subordinate to that language
 * (language → tags/questions); callers must pass the language of creation.
 */
interface UpsertQuestionsInput {
  languageId: string;
  questions: UpsertQuestion[];
  knowledgeTitles: string[];
  tags?: string[];
  sourceSessionId?: string;
  at: string;
}

function questionBankFilePath(storageUri: vscode.Uri): string {
  return path.join(storageUri.fsPath, QUESTION_BANK_FILENAME);
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function stableQuestionId(
  languageId: string,
  type: BankQuestionType,
  stem: string,
): string {
  return createHash('sha256')
    .update(`${normalize(languageId)}|${type}|${normalize(stem)}`)
    .digest('hex');
}

export async function loadQuestionBank(storageUri: vscode.Uri): Promise<QuestionBankFile> {
  try {
    const raw = await readFile(questionBankFilePath(storageUri), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!isQuestionBankFile(parsed)) {
      throw new Error('Invalid question bank file');
    }
    return parsed;
  } catch (error) {
    if (isMissingFileError(error)) {
      return emptyQuestionBank();
    }
    throw error;
  }
}

export async function saveQuestionBank(
  storageUri: vscode.Uri,
  bank: QuestionBankFile,
): Promise<void> {
  await mkdir(storageUri.fsPath, { recursive: true });
  await writeFile(questionBankFilePath(storageUri), JSON.stringify(bank, null, 2), 'utf8');
}

export async function upsertQuestions(
  storageUri: vscode.Uri,
  input: UpsertQuestionsInput,
): Promise<QuestionBankFile> {
  const existing = await loadQuestionBank(storageUri);
  const questions = [...existing.questions];
  const indexById = new Map(questions.map((question, index) => [question.id, index]));

  for (const inputQuestion of input.questions) {
    const id = stableQuestionId(input.languageId, inputQuestion.type, inputQuestion.stem);
    const existingIndex = indexById.get(id);
    const previous = existingIndex === undefined ? undefined : questions[existingIndex];
    const next: BankQuestion = {
      id,
      languageId: input.languageId,
      type: inputQuestion.type,
      stem: inputQuestion.stem.trim(),
      knowledgeTitles: unique(input.knowledgeTitles),
      starred: previous?.starred ?? false,
      createdAt: previous?.createdAt ?? input.at,
      updatedAt: input.at,
    };

    if (inputQuestion.options !== undefined) {
      next.options = [...inputQuestion.options];
    } else if (previous?.options !== undefined) {
      next.options = previous.options;
    }
    if (input.tags !== undefined) {
      next.tags = unique(input.tags);
    }
    if (inputQuestion.pass !== undefined) {
      next.lastResult = { pass: inputQuestion.pass, at: input.at };
    }
    if (input.sourceSessionId !== undefined) {
      next.sourceSessionId = input.sourceSessionId;
    }

    if (existingIndex === undefined) {
      indexById.set(id, questions.length);
      questions.push(next);
    } else {
      questions[existingIndex] = next;
    }
  }

  const bank: QuestionBankFile = {
    version: 1,
    questions: truncateQuestions(questions),
  };
  await saveQuestionBank(storageUri, bank);
  return bank;
}

export async function upsertQuestionsFromSession(
  storageUri: vscode.Uri,
  session: LearningSession,
): Promise<QuestionBankFile> {
  return upsertQuestions(storageUri, {
    languageId: session.languageId,
    questions: session.quizItems
      .filter((item): item is typeof item & { stem: string } => typeof item.stem === 'string')
      .map((item) => ({
        type: item.type,
        stem: item.stem,
        pass: item.pass,
      })),
    knowledgeTitles: session.knowledge.map((item) => item.title),
    tags: unique(session.knowledge.flatMap((item) => item.tags ?? [])),
    sourceSessionId: session.id,
    at: session.at,
  });
}

export async function upsertQuestionsFromGrade(
  storageUri: vscode.Uri,
  explain: ExplainResult,
  grade: GradeResult,
  sourceSessionId?: string,
  at = new Date().toISOString(),
): Promise<QuestionBankFile> {
  const resultById = new Map(grade.items.map((item) => [item.id, item]));
  const questions: UpsertQuestion[] = [
    ...explain.quiz.choices.map((question) => ({
      type: 'choice' as const,
      stem: question.stem,
      options: [...question.options],
      pass: resultById.get(question.id)?.pass,
    })),
    ...explain.quiz.shorts.map((question) => ({
      type: 'short' as const,
      stem: question.stem,
      pass: resultById.get(question.id)?.pass,
    })),
  ];

  return upsertQuestions(storageUri, {
    languageId: explain.meta.languageId,
    questions,
    knowledgeTitles: explain.knowledge.map((item) => item.title),
    tags: unique(explain.knowledge.flatMap((item) => item.tags ?? [])),
    sourceSessionId,
    at,
  });
}

export async function upsertRegressionQuestionsFromGrade(
  storageUri: vscode.Uri,
  paper: RegressionPaper,
  grade: GradeResult,
  sourceSessionId?: string,
  at = new Date().toISOString(),
): Promise<QuestionBankFile> {
  const existing = await loadQuestionBank(storageUri);
  const questions = [...existing.questions];
  const indexById = new Map(questions.map((question, index) => [question.id, index]));
  const resultById = new Map(grade.items.map((item) => [item.id, item]));

  for (const item of paper.items) {
    const result = resultById.get(item.id);
    if (!result) {
      continue;
    }

    const id =
      item.source === 'bank'
        ? item.bankId!
        : stableQuestionId(item.languageId, item.type, item.stem);
    const existingIndex = indexById.get(id);
    const previous = existingIndex === undefined ? undefined : questions[existingIndex];
    if (item.source === 'bank' && !previous) {
      continue;
    }

    const next: BankQuestion = {
      id,
      languageId: item.languageId,
      type: item.type,
      stem: item.stem.trim(),
      knowledgeTitles: unique(item.knowledgeTitles),
      starred: previous?.starred ?? false,
      createdAt: previous?.createdAt ?? at,
      updatedAt: at,
      lastResult: { pass: result.pass, at },
    };
    if (item.options !== undefined) {
      next.options = [...item.options];
    } else if (previous?.options !== undefined) {
      next.options = [...previous.options];
    }
    if (item.tags !== undefined) {
      next.tags = unique(item.tags);
    } else if (previous?.tags !== undefined) {
      next.tags = [...previous.tags];
    }
    if (sourceSessionId !== undefined) {
      next.sourceSessionId = sourceSessionId;
    } else if (previous?.sourceSessionId !== undefined) {
      next.sourceSessionId = previous.sourceSessionId;
    }

    if (existingIndex === undefined) {
      indexById.set(id, questions.length);
      questions.push(next);
    } else {
      questions[existingIndex] = next;
    }
  }

  const bank: QuestionBankFile = {
    version: 1,
    questions: truncateQuestions(questions),
  };
  await saveQuestionBank(storageUri, bank);
  return bank;
}

export async function setQuestionStarred(
  storageUri: vscode.Uri,
  id: string,
  starred: boolean,
): Promise<QuestionBankFile> {
  const bank = await loadQuestionBank(storageUri);
  const index = bank.questions.findIndex((question) => question.id === id);
  if (index === -1 || bank.questions[index].starred === starred) {
    return bank;
  }

  const questions = [...bank.questions];
  questions[index] = { ...questions[index], starred };
  const updated: QuestionBankFile = { version: 1, questions };
  await saveQuestionBank(storageUri, updated);
  return updated;
}

export function searchQuestions(
  bank: QuestionBankFile,
  filters: QuestionSearchFilters,
): BankQuestion[] {
  const languageId = normalize(filters.languageId ?? '');
  const tag = normalize(filters.tag ?? '');
  const query = normalize(filters.query ?? '');

  return bank.questions.filter((question) => {
    if (languageId && normalize(question.languageId) !== languageId) {
      return false;
    }
    if (tag && !(question.tags ?? []).some((value) => normalize(value) === tag)) {
      return false;
    }
    if (filters.starredOnly && !question.starred) {
      return false;
    }
    if (!query) {
      return true;
    }
    const searchable = [
      question.stem,
      question.languageId,
      ...question.knowledgeTitles,
      ...(question.tags ?? []),
    ].map(normalize);
    return searchable.some((value) => value.includes(query));
  });
}

function truncateQuestions(
  questions: BankQuestion[],
  max = DEFAULT_MAX_QUESTIONS,
): BankQuestion[] {
  if (questions.length <= max) {
    return questions;
  }

  const removalOrder = questions
    .map((question, index) => ({ question, index }))
    .sort((left, right) => {
      if (left.question.starred !== right.question.starred) {
        return left.question.starred ? 1 : -1;
      }
      const timeOrder = left.question.updatedAt.localeCompare(right.question.updatedAt);
      return timeOrder || left.index - right.index;
    });
  const remove = new Set(removalOrder.slice(0, questions.length - max).map(({ index }) => index));
  return questions.filter((_, index) => !remove.has(index));
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

function isQuestionBankFile(value: unknown): value is QuestionBankFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    value.version === 1 &&
    'questions' in value &&
    Array.isArray(value.questions)
  );
}
