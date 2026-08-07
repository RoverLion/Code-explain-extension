import { randomUUID } from 'node:crypto';
import { knowledgeStatKey } from './learningStore';
import type { KnowledgeStat, LearningProgressFile } from './learningTypes';
import { buildRegressionPaperPrompt } from './prompts';
import type { BankQuestion, QuestionBankFile } from './questionBankTypes';
import type { RegressionPaper } from './regressionTypes';
import { extractJsonObject, parseRegressionPaper } from './schema';

export interface PickBankItemsOptions {
  bank: QuestionBankFile;
  progress: LearningProgressFile;
  languageFilter: string | 'all';
  limit?: number;
}

export interface AssembleRegressionPaperOptions {
  progress: LearningProgressFile;
  bank: QuestionBankFile;
  languageFilter: string | 'all';
  outputLanguage: string;
  generateAiItems: (prompt: string) => Promise<unknown>;
}

function accuracy(stat: KnowledgeStat): number {
  const total = stat.correct + stat.wrong;
  return total ? stat.correct / total : 1;
}

function isWeakStat(stat: KnowledgeStat): boolean {
  const total = stat.correct + stat.wrong;
  if (total === 0) {
    return false;
  }
  return stat.wrong > stat.correct || accuracy(stat) < 0.5;
}

function weaknessScore(stat: KnowledgeStat): number {
  const total = stat.correct + stat.wrong;
  if (total === 0) {
    return 0;
  }
  return stat.wrong * 100 + Math.round((1 - accuracy(stat)) * total);
}

function statForQuestion(
  progress: LearningProgressFile,
  question: BankQuestion,
  title: string,
): KnowledgeStat | undefined {
  return progress.knowledgeStats[knowledgeStatKey(question.languageId, title)];
}

function questionWeakness(progress: LearningProgressFile, question: BankQuestion): number {
  return question.knowledgeTitles.reduce((maxScore, title) => {
    const stat = statForQuestion(progress, question, title);
    if (!stat || !isWeakStat(stat)) {
      return maxScore;
    }
    return Math.max(maxScore, weaknessScore(stat));
  }, 0);
}

function questionTier(progress: LearningProgressFile, question: BankQuestion): number {
  if (questionWeakness(progress, question) > 0) {
    return 0;
  }
  if (!question.starred) {
    return 1;
  }
  return 2;
}

function primaryKnowledgeTitle(progress: LearningProgressFile, question: BankQuestion): string {
  let bestTitle = question.knowledgeTitles[0] ?? '';
  let bestScore = -1;
  for (const title of question.knowledgeTitles) {
    const stat = statForQuestion(progress, question, title);
    const score = stat && isWeakStat(stat) ? weaknessScore(stat) : 0;
    if (score > bestScore) {
      bestScore = score;
      bestTitle = title;
    }
  }
  return bestTitle;
}

function compareCandidates(
  progress: LearningProgressFile,
  left: BankQuestion,
  right: BankQuestion,
): number {
  const tierDiff = questionTier(progress, left) - questionTier(progress, right);
  if (tierDiff !== 0) {
    return tierDiff;
  }
  const weaknessDiff = questionWeakness(progress, right) - questionWeakness(progress, left);
  if (weaknessDiff !== 0) {
    return weaknessDiff;
  }
  return left.id.localeCompare(right.id);
}

export function listLearnedLanguageIds(
  progress: LearningProgressFile,
  bank: QuestionBankFile,
): string[] {
  const languages = new Set<string>();
  for (const stat of Object.values(progress.knowledgeStats)) {
    languages.add(stat.languageId);
  }
  for (const session of progress.sessions) {
    languages.add(session.languageId);
  }
  for (const question of bank.questions) {
    languages.add(question.languageId);
  }
  return [...languages].sort((left, right) => left.localeCompare(right));
}

function filterByLanguage(
  questions: BankQuestion[],
  languageFilter: string | 'all',
  learnedLanguageIds: string[],
): BankQuestion[] {
  if (languageFilter === 'all') {
    const learned = new Set(learnedLanguageIds);
    return questions.filter((question) => learned.has(question.languageId));
  }
  return questions.filter((question) => question.languageId === languageFilter);
}

export function pickBankItemsForRegression({
  bank,
  progress,
  languageFilter,
  limit = 5,
}: PickBankItemsOptions): BankQuestion[] {
  const learnedLanguageIds = listLearnedLanguageIds(progress, bank);
  const candidates = filterByLanguage(bank.questions, languageFilter, learnedLanguageIds);
  if (candidates.length === 0 || limit <= 0) {
    return [];
  }

  const picked: BankQuestion[] = [];
  const pickedIds = new Set<string>();
  const coveredTitles = new Set<string>();

  const take = (question: BankQuestion): void => {
    if (picked.length >= limit || pickedIds.has(question.id)) {
      return;
    }
    picked.push(question);
    pickedIds.add(question.id);
    for (const title of question.knowledgeTitles) {
      coveredTitles.add(title);
    }
  };

  const remaining = (): BankQuestion[] =>
    candidates.filter((question) => !pickedIds.has(question.id));

  const weakByTitle = new Map<string, BankQuestion[]>();
  for (const question of remaining()) {
    if (questionTier(progress, question) !== 0) {
      continue;
    }
    const title = primaryKnowledgeTitle(progress, question);
    const bucket = weakByTitle.get(title) ?? [];
    bucket.push(question);
    weakByTitle.set(title, bucket);
  }

  for (const [title, questions] of [...weakByTitle.entries()].sort(([left], [right]) =>
    left.localeCompare(right, 'zh-CN'))) {
    questions.sort((left, right) => compareCandidates(progress, left, right));
    take(questions[0]!);
  }

  while (picked.length < limit) {
    const pool = remaining().sort((left, right) => compareCandidates(progress, left, right));
    const diversified = pool.find((question) =>
      question.knowledgeTitles.some((title) => !coveredTitles.has(title)));
    if (diversified) {
      take(diversified);
      continue;
    }
    const next = pool[0];
    if (!next) {
      break;
    }
    take(next);
  }

  return picked;
}

function listWeakKnowledge(
  progress: LearningProgressFile,
  languageFilter: string | 'all',
): string[] {
  return Object.values(progress.knowledgeStats)
    .filter(
      (stat) =>
        (languageFilter === 'all' || stat.languageId === languageFilter) && isWeakStat(stat),
    )
    .sort((left, right) => weaknessScore(right) - weaknessScore(left))
    .map((stat) => stat.title);
}

/** Collect topic titles from weak stats + bank knowledge — never reuse bank quiz stems. */
export function collectRegressionTopicSeeds(
  progress: LearningProgressFile,
  bank: QuestionBankFile,
  languageFilter: string | 'all',
  limit = 12,
): string[] {
  const topics: string[] = [];
  const seen = new Set<string>();
  const push = (title: string): void => {
    const key = title.trim().toLowerCase();
    if (!key || seen.has(key) || topics.length >= limit) {
      return;
    }
    seen.add(key);
    topics.push(title.trim());
  };

  for (const title of listWeakKnowledge(progress, languageFilter)) {
    push(title);
  }
  for (const question of pickBankItemsForRegression({ bank, progress, languageFilter, limit: 8 })) {
    for (const title of question.knowledgeTitles) {
      push(title);
    }
  }
  for (const stat of Object.values(progress.knowledgeStats)) {
    if (languageFilter !== 'all' && stat.languageId !== languageFilter) {
      continue;
    }
    push(stat.title);
  }
  return topics;
}

function parseGeneratedPaper(input: unknown): RegressionPaper {
  return parseRegressionPaper(typeof input === 'string' ? extractJsonObject(input) : input);
}

const REGRESSION_PAPER_ITEM_COUNT = 6;

export async function assembleRegressionPaper({
  progress,
  bank,
  languageFilter,
  outputLanguage,
  generateAiItems,
}: AssembleRegressionPaperOptions): Promise<RegressionPaper> {
  const languages =
    languageFilter === 'all'
      ? listLearnedLanguageIds(progress, bank)
      : [languageFilter];
  const topicSeeds = collectRegressionTopicSeeds(progress, bank, languageFilter);
  const prompt = buildRegressionPaperPrompt({
    languages: languages.length > 0 ? languages : [languageFilter === 'all' ? 'typescript' : languageFilter],
    topicSeeds,
    outputLanguage,
    count: REGRESSION_PAPER_ITEM_COUNT,
  });
  const generated = parseGeneratedPaper(await generateAiItems(prompt));
  if (generated.items.length !== REGRESSION_PAPER_ITEM_COUNT) {
    throw new Error(
      `AI generated ${generated.items.length} items; expected ${REGRESSION_PAPER_ITEM_COUNT}`,
    );
  }
  if (generated.items.some((item) => item.source !== 'ai')) {
    throw new Error('Regression paper must contain only source "ai" items');
  }
  const codeItemCount = generated.items.filter((item) => item.type === 'code').length;
  if (codeItemCount !== 1) {
    throw new Error('Regression paper must contain exactly 1 code item');
  }

  return {
    id: randomUUID(),
    at: new Date().toISOString(),
    languageFilter,
    items: generated.items,
  };
}
