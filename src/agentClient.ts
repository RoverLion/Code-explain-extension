import { chatCompletion } from './openaiClient';
import {
  extractJsonObject,
  parseExplainResult,
  parseGradeResult,
  parseRegressionPaper,
} from './schema';
import type { RegressionPaper } from './regressionTypes';
import type { ExplainResult, GradeResult } from './types';

type ResultParser<T> = (input: unknown) => T;

export class ExplainAgentSession {
  private disposed = false;

  constructor(
    private readonly opts: { apiKey: string; modelId: string; baseUrl: string },
  ) {}

  async explain(prompt: string): Promise<ExplainResult> {
    return this.requestJson(prompt, parseExplainResult);
  }

  async grade(prompt: string): Promise<GradeResult> {
    return this.requestJson(prompt, parseGradeResult);
  }

  async generateRegressionPaper(prompt: string): Promise<RegressionPaper> {
    return this.requestJson(prompt, parseRegressionPaper);
  }

  async dispose(): Promise<void> {
    this.disposed = true;
  }

  private async requestJson<T>(prompt: string, parse: ResultParser<T>): Promise<T> {
    let response = '';
    let lastParseError = '';

    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (this.disposed) {
        throw new Error('ExplainAgentSession has been disposed');
      }
      response = await this.send(
        attempt === 0 ? prompt : this.repairPrompt(response, lastParseError),
      );
      try {
        return parse(extractJsonObject(response));
      } catch (error) {
        if (attempt === 1) {
          throw error;
        }
        lastParseError = error instanceof Error ? error.message : String(error);
      }
    }

    throw new Error('Unreachable JSON parse retry state');
  }

  private async send(prompt: string): Promise<string> {
    return chatCompletion({
      baseUrl: this.opts.baseUrl,
      apiKey: this.opts.apiKey,
      model: this.opts.modelId,
      messages: [
        {
          role: 'system',
          content:
            'You are a precise coding tutor. Follow the user instructions exactly. Prefer returning only the requested JSON object.',
        },
        { role: 'user', content: prompt },
      ],
    });
  }

  private repairPrompt(response: string, parseError: string): string {
    const tooFewChoices = /quiz\.choices must contain at least/i.test(parseError);
    const angleHint = tooFewChoices
      ? [
          'The previous quiz had too few multiple-choice items.',
          'Regenerate the full ExplainResult JSON with a **different questioning angle**: focus on other knowledge points, edge cases, API contracts, or common mistakes — do not reuse the same stems.',
          'Prefer 3–5 choices (1–5 allowed). Each choice needs exactly 4 options. Keep 1–2 shorts.',
        ].join(' ')
      : 'Prefer 3–5 quiz.choices (1–5 allowed, each with 4 options); shorts must be 1–2.';

    return [
      'Your previous response could not be parsed as the required JSON result.',
      `Parse error: ${parseError}`,
      angleHint,
      'Return only a corrected JSON object that exactly matches the requested schema.',
      'Previous response:',
      response,
    ].join('\n');
  }
}
