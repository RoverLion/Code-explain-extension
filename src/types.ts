export interface ExplainRequest {
  workspaceRoot: string;
  filePath: string;
  languageId: string;
  selectionText: string;
  selectionRange: {
    startLine: number;
    endLine: number;
    startCharacter: number;
    endCharacter: number;
  };
  fileText?: string;
}

export interface ExplainResult {
  meta: {
    title: string;
    languageId: string;
    filePath: string;
    summary: string;
    lineBase?: 'absolute' | 'relative';
  };
  lines: Array<{
    line: number;
    code: string;
    meaning: string;
  }>;
  knowledge: Array<{
    id: string;
    title: string;
    body: string;
    tags?: string[];
  }>;
  quiz: {
    choices: Array<{
      id: string;
      stem: string;
      options: [string, string, string, string];
    }>;
    shorts: Array<{
      id: string;
      stem: string;
      hint?: string;
    }>;
  };
}

export interface GradeResult {
  score: { correct: number; total: number; percent: number };
  items: Array<{
    id: string;
    type: 'choice' | 'short' | 'code';
    pass: boolean;
    feedback: string;
  }>;
}

export interface QuizAnswers {
  choices: Record<string, number>;
  shorts: Record<string, string>;
}
