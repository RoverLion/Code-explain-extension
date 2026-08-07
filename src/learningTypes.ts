export interface LearningProgressFile {
  version: 2;
  sessions: LearningSession[];
  knowledgeStats: Record<string, KnowledgeStat>;
}

export interface LearningSession {
  id: string;
  at: string;
  filePath: string;
  languageId: string;
  title: string;
  summary: string;
  knowledge: Array<{ id: string; title: string; tags?: string[] }>;
  quizItems: Array<{
    id: string;
    type: 'choice' | 'short' | 'code';
    pass: boolean;
    feedback: string;
    stem?: string;
  }>;
  score: { correct: number; total: number; percent: number };
}

export interface KnowledgeStat {
  title: string;
  languageId: string;
  tags?: string[];
  correct: number;
  wrong: number;
  lastAt: string;
  lastPass: boolean;
}

export type RecordLearningSessionInput = Omit<LearningSession, 'id' | 'at'>;

export function emptyLearningProgress(): LearningProgressFile {
  return { version: 2, sessions: [], knowledgeStats: {} };
}
