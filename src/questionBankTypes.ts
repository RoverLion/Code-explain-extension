export type BankQuestionType = 'choice' | 'short' | 'code';

export interface QuestionBankFile {
  version: 1;
  questions: BankQuestion[];
}

export interface BankQuestion {
  id: string;
  languageId: string;
  type: BankQuestionType;
  stem: string;
  options?: string[];
  knowledgeTitles: string[];
  tags?: string[];
  starred: boolean;
  createdAt: string;
  updatedAt: string;
  lastResult?: {
    pass: boolean;
    at: string;
  };
  sourceSessionId?: string;
}

export interface QuestionSearchFilters {
  languageId?: string;
  tag?: string;
  query?: string;
  starredOnly?: boolean;
}

export function emptyQuestionBank(): QuestionBankFile {
  return { version: 1, questions: [] };
}
