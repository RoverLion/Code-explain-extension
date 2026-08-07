import type { ExplainRequest, ExplainResult, GradeResult, QuizAnswers } from './types';
import type { RegressionAnswers, RegressionPaper } from './regressionTypes';

const EXPLAIN_RESULT_SHAPE = `{
  "meta": { "title": string, "languageId": string, "filePath": string, "summary": string, "lineBase"?: "absolute" | "relative" },
  "lines": [{ "line": number, "code": string, "meaning": string }],
  "knowledge": [{ "id": string, "title": string, "body": string, "tags"?: string[] }],
  "quiz": {
    "choices": [{ "id": string, "stem": string, "options": [string, string, string, string] }],
    "shorts": [{ "id": string, "stem": string, "hint"?: string }]
  }
}`;

const GRADE_RESULT_SHAPE = `{
  "score": { "correct": number, "total": number, "percent": number },
  "items": [{ "id": string, "type": "choice" | "short" | "code", "pass": boolean, "feedback": string }]
}`;

const REGRESSION_PAPER_SHAPE = `{
  "id": string,
  "at": string,
  "languageFilter": string | "all",
  "items": [{
    "id": string,
    "source": "ai",
    "languageId": string,
    "type": "choice" | "short" | "code",
    "stem": string,
    "options"?: string[],
    "knowledgeTitles": string[],
    "tags"?: string[]
  }]
}`;

function buildLanguageDirective(outputLanguage: string): string {
  return `Write all user-facing natural language fields in ${outputLanguage} (JSON keys stay English).`;
}

export interface BuildRegressionPaperPromptOptions {
  languages: string[];
  /** Knowledge topic titles only — never paste original quiz stems or business code. */
  topicSeeds: string[];
  outputLanguage: string;
  count: number;
}

export function buildRegressionPaperPrompt({
  languages,
  topicSeeds,
  outputLanguage,
  count,
}: BuildRegressionPaperPromptOptions): string {
  return [
    'You are creating a programming regression / interview-style practice test.',
    '',
    '## Output constraints',
    `- ${buildLanguageDirective(outputLanguage)}`,
    '- Respond with only valid JSON matching the RegressionPaper schema (no markdown fence, no prose).',
    `- Generate exactly ${count} items, all with source "ai".`,
    '- Include exactly 1 item with type "code"; the rest must be "choice" or "short".',
    '- Choice items must include options; short and code items must not include options.',
    '- Questions MUST be general, reusable, and interview-ready for the listed languages/topics.',
    '- Do NOT reference any specific project, file, business API, proprietary type, or prior code-explain quiz stem.',
    '- Do NOT ask about unknown business input/output contracts; use only language/standard-library/common patterns.',
    '- Stems must be self-contained so a learner can answer without any original codebase context.',
    topicSeeds.length > 0
      ? '- Prefer covering the listed topic seeds, but phrase questions generically (concept checks, not project walkthroughs).'
      : '- Choose practical foundational topics for the listed languages.',
    '',
    '## RegressionPaper schema',
    REGRESSION_PAPER_SHAPE,
    '',
    '## Topic guidance (not prior exam stems)',
    `- Languages: ${JSON.stringify(languages)}`,
    `- Topic seeds: ${JSON.stringify(topicSeeds)}`,
    '',
    'Return RegressionPaper JSON only.',
  ].join('\n');
}

export function buildRegressionGradePrompt(args: {
  paper: RegressionPaper;
  answers: RegressionAnswers;
  outputLanguage: string;
}): string {
  const { paper, answers, outputLanguage } = args;
  const items = paper.items.map((item) => {
    const context = [
      `- [${item.id}] type=${item.type}; language=${item.languageId}`,
      `  Stem: ${item.stem}`,
      `  Knowledge: ${item.knowledgeTitles.join(', ') || '(none)'}`,
    ];
    if (item.type === 'choice') {
      const selected = answers.choices[item.id];
      const selectedLabel =
        selected === undefined
          ? '(no answer)'
          : `${selected}: ${item.options?.[selected] ?? '?'}`;
      context.push(`  Options: ${(item.options ?? []).map((option, index) => `${index}=${option}`).join(' | ')}`);
      context.push(`  User answer: ${selectedLabel}`);
    } else {
      context.push(`  User answer: ${answers.texts[item.id]?.trim() || '(no answer)'}`);
    }
    return context.join('\n');
  });

  return [
    'You are grading a programming regression test.',
    '',
    '## Output constraints',
    `- ${buildLanguageDirective(outputLanguage)}`,
    '- Respond with only valid JSON matching the GradeResult schema (no markdown fence, no prose).',
    '- Return exactly one grade item for every paper item, preserving its id and type.',
    '- Grade all answers by semantic correctness. Accept equivalent explanations and valid alternative code.',
    '- Do not execute, compile, or sandbox user code; assess code semantically only.',
    '- Unanswered items must fail with useful feedback.',
    '',
    '## GradeResult schema',
    GRADE_RESULT_SHAPE,
    '',
    '## Paper and user answers',
    ...items,
    '',
    'Return GradeResult JSON only.',
  ].join('\n');
}

export function buildExplainPrompt(req: ExplainRequest, outputLanguage: string): string {
  const range = req.selectionRange;
  const fileSection = req.fileText
    ? `\n## Full file context\n\`\`\`${req.languageId}\n${req.fileText}\n\`\`\`\n`
    : '';

  return [
    'You are a code tutor. Explain the selected code for a developer learning this codebase.',
    '',
    '## Output format',
    `- ${buildLanguageDirective(outputLanguage)}`,
    `- Respond with **only** valid JSON matching the ExplainResult schema (no markdown fence, no prose).`,
    `- Do **not** include fields that reveal correct answers to the client (no answer keys or solutions in the JSON).`,
    `- Set meta.lineBase to "absolute" and use **source file line numbers** (1-based) in lines[].line.`,
    `- quiz.choices: prefer **3–5** items (allowed range **1–5**). Each choice must have exactly 4 options of similar length.`,
    `- If the selection is small, still produce at least 1 choice by asking about intent, edge cases, or related concepts — do not omit choices.`,
    `- quiz.shorts: **exactly 1–2** items.`,
    `- Vary question angles across knowledge points (behavior, pitfalls, APIs, alternatives); avoid near-duplicate stems.`,
    '',
    '## ExplainResult schema',
    EXPLAIN_RESULT_SHAPE,
    '',
    '## Workspace',
    `- Root: ${req.workspaceRoot}`,
    `- File: ${req.filePath}`,
    `- Language: ${req.languageId}`,
    `- Selection lines ${range.startLine + 1}–${range.endLine + 1} (characters ${range.startCharacter}–${range.endCharacter})`,
    '',
    '## Selected code',
    '```' + req.languageId,
    req.selectionText,
    '```',
    fileSection,
    '## Related context',
    'Use the selected code and the provided full-file context above. Infer imports, dependencies, and types from that context; do not claim you searched other repository files.',
    '',
    'Return ExplainResult JSON only.',
  ].join('\n');
}

export function buildGradePrompt(args: {
  explain: ExplainResult;
  answers: QuizAnswers;
  outputLanguage: string;
}): string {
  const { explain, answers, outputLanguage } = args;
  const choiceLines = explain.quiz.choices.map((c) => {
    const selected = answers.choices[c.id];
    const selectedLabel =
      selected === undefined ? '(no answer)' : `${selected}: ${c.options[selected] ?? '?'}`;
    return `- [${c.id}] ${c.stem}\n  Options: ${c.options.map((o, i) => `${i}=${o}`).join(' | ')}\n  User answer: ${selectedLabel}`;
  });
  const shortLines = explain.quiz.shorts.map((s) => {
    const text = answers.shorts[s.id]?.trim() || '(no answer)';
    const hint = s.hint ? `\n  Hint shown to user: ${s.hint}` : '';
    return `- [${s.id}] ${s.stem}\n  User answer: ${text}${hint}`;
  });

  return [
    'You are grading a code-learning quiz. Compare user answers against the explained code.',
    '',
    '## Output format',
    `- ${buildLanguageDirective(outputLanguage)}`,
    `- Respond with **only** valid JSON matching the GradeResult schema (no markdown fence, no prose).`,
    `- Grade multiple-choice by correctness; grade short answers by **semantic** equivalence (synonyms and paraphrases count).`,
    `- Provide per-item "feedback" explaining why each answer passed or failed.`,
    '',
    '## GradeResult schema',
    GRADE_RESULT_SHAPE,
    '',
    '## Code summary',
    explain.meta.summary,
    '',
    '## Line explanations',
    ...explain.lines.map((l) => `- L${l.line}: ${l.code} — ${l.meaning}`),
    '',
    '## Multiple choice',
    ...choiceLines,
    '',
    '## Short answers',
    ...shortLines,
    '',
    'Return GradeResult JSON only.',
  ].join('\n');
}
