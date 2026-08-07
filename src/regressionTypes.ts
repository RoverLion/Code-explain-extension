import type { BankQuestionType } from './questionBankTypes';

export interface RegressionPaper {
  id: string;
  at: string;
  languageFilter: string | 'all';
  items: RegressionItem[];
}

export interface RegressionItem {
  id: string;
  source: 'bank' | 'ai';
  bankId?: string;
  languageId: string;
  type: BankQuestionType;
  stem: string;
  options?: string[];
  knowledgeTitles: string[];
  tags?: string[];
}

export interface RegressionAnswers {
  choices: Record<string, number>;
  texts: Record<string, string>;
}
