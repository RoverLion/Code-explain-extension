import type { RegressionPaper, RegressionItem } from './regressionTypes';
import type { ExplainResult, GradeResult } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(obj: Record<string, unknown>, key: string, label = key): string {
  const value = obj[key];
  if (typeof value !== 'string') {
    throw new Error(`Invalid or missing string field: ${label}`);
  }
  return value;
}

function requireNumber(obj: Record<string, unknown>, key: string, label = key): number {
  const value = obj[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid or missing number field: ${label}`);
  }
  return value;
}

function parseLineBase(value: unknown): 'absolute' | 'relative' {
  if (value === 'absolute' || value === 'relative') {
    return value;
  }
  throw new Error('Invalid lineBase: expected "absolute" or "relative"');
}

function parseStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid or missing array field: ${label}`);
  }
  return value.map((item, index) => {
    if (typeof item !== 'string') {
      throw new Error(`Invalid string in ${label}[${index}]`);
    }
    return item;
  });
}

function parseQuestionType(value: unknown, label: string): 'choice' | 'short' | 'code' {
  if (value === 'choice' || value === 'short' || value === 'code') {
    return value;
  }
  throw new Error(`Invalid type at ${label}`);
}

function parseChoiceOptions(value: unknown, label: string): [string, string, string, string] {
  const options = parseStringArray(value, label);
  if (options.length !== 4) {
    throw new Error(`${label} must contain exactly 4 options`);
  }
  return [options[0], options[1], options[2], options[3]];
}

export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  const jsonText = fenced ? fenced[1] : extractBareJsonObject(text);
  return JSON.parse(jsonText);
}

function extractBareJsonObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in text');
  }
  return text.slice(start, end + 1);
}

export function parseExplainResult(input: unknown): ExplainResult {
  if (!isRecord(input)) {
    throw new Error('ExplainResult must be an object');
  }

  if (!isRecord(input.meta)) {
    throw new Error('Missing meta');
  }

  const meta: ExplainResult['meta'] = {
    title: requireString(input.meta, 'title', 'meta.title'),
    languageId: requireString(input.meta, 'languageId', 'meta.languageId'),
    filePath: requireString(input.meta, 'filePath', 'meta.filePath'),
    summary: requireString(input.meta, 'summary', 'meta.summary'),
  };

  if (input.meta.lineBase !== undefined) {
    meta.lineBase = parseLineBase(input.meta.lineBase);
  }

  if (!Array.isArray(input.lines)) {
    throw new Error('Missing lines');
  }

  const lines = input.lines.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`Invalid line at index ${index}`);
    }
    return {
      line: requireNumber(item, 'line', `lines[${index}].line`),
      code: requireString(item, 'code', `lines[${index}].code`),
      meaning: requireString(item, 'meaning', `lines[${index}].meaning`),
    };
  });

  if (!Array.isArray(input.knowledge)) {
    throw new Error('Missing knowledge');
  }

  const knowledge = input.knowledge.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`Invalid knowledge item at index ${index}`);
    }
    const entry: ExplainResult['knowledge'][number] = {
      id: requireString(item, 'id', `knowledge[${index}].id`),
      title: requireString(item, 'title', `knowledge[${index}].title`),
      body: requireString(item, 'body', `knowledge[${index}].body`),
    };
    if (item.tags !== undefined) {
      entry.tags = parseStringArray(item.tags, `knowledge[${index}].tags`);
    }
    return entry;
  });

  if (!isRecord(input.quiz)) {
    throw new Error('Missing quiz');
  }

  if (!Array.isArray(input.quiz.choices)) {
    throw new Error('Missing quiz.choices');
  }

  const choices = input.quiz.choices.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`Invalid quiz choice at index ${index}`);
    }
    return {
      id: requireString(item, 'id', `quiz.choices[${index}].id`),
      stem: requireString(item, 'stem', `quiz.choices[${index}].stem`),
      options: parseChoiceOptions(item.options, `quiz.choices[${index}].options`),
    };
  });

  if (choices.length < 1) {
    throw new Error('quiz.choices must contain at least 1 item');
  }
  if (choices.length > 5) {
    throw new Error('quiz.choices must contain at most 5 items');
  }

  if (!Array.isArray(input.quiz.shorts)) {
    throw new Error('Missing quiz.shorts');
  }

  const shorts = input.quiz.shorts.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`Invalid quiz short at index ${index}`);
    }
    const entry: ExplainResult['quiz']['shorts'][number] = {
      id: requireString(item, 'id', `quiz.shorts[${index}].id`),
      stem: requireString(item, 'stem', `quiz.shorts[${index}].stem`),
    };
    if (item.hint !== undefined) {
      entry.hint = requireString(item, 'hint', `quiz.shorts[${index}].hint`);
    }
    return entry;
  });

  if (shorts.length < 1) {
    throw new Error('quiz.shorts must contain at least 1 item');
  }
  if (shorts.length > 2) {
    throw new Error('quiz.shorts must contain at most 2 items');
  }

  return { meta, lines, knowledge, quiz: { choices, shorts } };
}

export function parseGradeResult(input: unknown): GradeResult {
  if (!isRecord(input)) {
    throw new Error('GradeResult must be an object');
  }

  if (!isRecord(input.score)) {
    throw new Error('Missing score');
  }

  const score = {
    correct: requireNumber(input.score, 'correct', 'score.correct'),
    total: requireNumber(input.score, 'total', 'score.total'),
    percent: requireNumber(input.score, 'percent', 'score.percent'),
  };

  if (!Array.isArray(input.items)) {
    throw new Error('Missing items');
  }

  const items = input.items.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`Invalid grade item at index ${index}`);
    }
    const itemType = parseQuestionType(item.type, `items[${index}]`);
    return {
      id: requireString(item, 'id', `items[${index}].id`),
      type: itemType,
      pass: item.pass === true,
      feedback: requireString(item, 'feedback', `items[${index}].feedback`),
    };
  });

  return { score, items };
}

function parseLanguageFilter(value: unknown): string | 'all' {
  if (value === 'all') {
    return 'all';
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  throw new Error('Invalid languageFilter: expected "all" or a non-empty string');
}

function parseRegressionSource(value: unknown, label: string): 'bank' | 'ai' {
  if (value === 'bank' || value === 'ai') {
    return value;
  }
  throw new Error(`Invalid source at ${label}`);
}

function parseRegressionItem(item: unknown, index: number): RegressionItem {
  if (!isRecord(item)) {
    throw new Error(`Invalid regression item at index ${index}`);
  }

  const source = parseRegressionSource(item.source, `items[${index}]`);
  const type = parseQuestionType(item.type, `items[${index}]`);

  const entry: RegressionItem = {
    id: requireString(item, 'id', `items[${index}].id`),
    source,
    languageId: requireString(item, 'languageId', `items[${index}].languageId`),
    type,
    stem: requireString(item, 'stem', `items[${index}].stem`),
    knowledgeTitles: parseStringArray(item.knowledgeTitles, `items[${index}].knowledgeTitles`),
  };

  if (source === 'bank') {
    entry.bankId = requireString(item, 'bankId', `items[${index}].bankId`);
  } else if (item.bankId !== undefined) {
    throw new Error(`Unexpected bankId at items[${index}] when source is ai`);
  }

  if (type === 'choice') {
    if (item.options === undefined) {
      throw new Error(`Missing options at items[${index}] for choice type`);
    }
    const options = parseStringArray(item.options, `items[${index}].options`);
    if (options.length < 2) {
      throw new Error(`items[${index}].options must contain at least 2 options`);
    }
    entry.options = options;
  }

  if (item.tags !== undefined) {
    entry.tags = parseStringArray(item.tags, `items[${index}].tags`);
  }

  return entry;
}

export function parseRegressionPaper(input: unknown): RegressionPaper {
  if (!isRecord(input)) {
    throw new Error('RegressionPaper must be an object');
  }

  if (!Array.isArray(input.items)) {
    throw new Error('Missing items');
  }

  if (input.items.length < 1) {
    throw new Error('items must contain at least 1 item');
  }

  const items = input.items.map((item, index) => parseRegressionItem(item, index));

  return {
    id: requireString(input, 'id', 'id'),
    at: requireString(input, 'at', 'at'),
    languageFilter: parseLanguageFilter(input.languageFilter),
    items,
  };
}
