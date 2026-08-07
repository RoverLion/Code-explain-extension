import type {
  KnowledgeStat,
  LearningProgressFile,
  LearningSession,
} from './learningTypes';
import { searchQuestions } from './questionBankStore';
import type {
  BankQuestion,
  QuestionBankFile,
  QuestionSearchFilters,
} from './questionBankTypes';

export interface ProgressFilters {
  languageId?: string;
  tag?: string;
  query?: string;
}

function normalize(value: string | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function matchesFilters(
  languageId: string,
  tags: string[] | undefined,
  searchableValues: string[],
  filters: ProgressFilters,
): boolean {
  const language = normalize(filters.languageId);
  const tag = normalize(filters.tag);
  const query = normalize(filters.query);
  return (
    (!language || normalize(languageId) === language) &&
    (!tag || (tags ?? []).some((value) => normalize(value) === tag)) &&
    (!query || searchableValues.some((value) => normalize(value).includes(query)))
  );
}

function accuracy(stat: KnowledgeStat): number {
  const total = stat.correct + stat.wrong;
  return total ? stat.correct / total : 0;
}

export function filterKnowledgeStats(
  stats: LearningProgressFile['knowledgeStats'],
  filters: ProgressFilters,
): KnowledgeStat[] {
  return Object.values(stats)
    .filter((stat) => matchesFilters(
      stat.languageId,
      stat.tags,
      [stat.title, stat.languageId, ...(stat.tags ?? [])],
      filters,
    ))
    .sort((left, right) => accuracy(left) - accuracy(right)
      || left.title.localeCompare(right.title, 'zh-CN'));
}

export function filterLearningSessions(
  sessions: LearningSession[],
  filters: ProgressFilters,
): LearningSession[] {
  return sessions.filter((session) => {
    const tags = session.knowledge.flatMap((item) => item.tags ?? []);
    return matchesFilters(
      session.languageId,
      tags,
      [
        session.title,
        session.summary,
        session.filePath,
        session.languageId,
        ...session.knowledge.map((item) => item.title),
        ...tags,
      ],
      filters,
    );
  });
}

export function filterQuestionBank(
  bank: QuestionBankFile,
  filters: QuestionSearchFilters,
): BankQuestion[] {
  return searchQuestions(bank, filters);
}

/**
 * Languages are global; tags are subordinate to a selected language.
 * When `languageId` is empty, `tags` is empty (UI should require language first).
 */
export function collectProgressFilterOptions(
  progress: LearningProgressFile,
  bank: QuestionBankFile,
  languageId?: string,
): { languages: string[]; tags: string[] } {
  const languages = new Set<string>();
  const tags = new Set<string>();
  const selectedLanguage = normalize(languageId);

  for (const stat of Object.values(progress.knowledgeStats)) {
    languages.add(stat.languageId);
    if (selectedLanguage && normalize(stat.languageId) === selectedLanguage) {
      stat.tags?.forEach((tag) => tags.add(tag));
    }
  }
  for (const session of progress.sessions) {
    languages.add(session.languageId);
    if (selectedLanguage && normalize(session.languageId) === selectedLanguage) {
      session.knowledge.forEach((item) => item.tags?.forEach((tag) => tags.add(tag)));
    }
  }
  for (const question of bank.questions) {
    languages.add(question.languageId);
    if (selectedLanguage && normalize(question.languageId) === selectedLanguage) {
      question.tags?.forEach((tag) => tags.add(tag));
    }
  }

  return {
    languages: [...languages].sort((left, right) => left.localeCompare(right)),
    tags: [...tags].sort((left, right) => left.localeCompare(right, 'zh-CN')),
  };
}
