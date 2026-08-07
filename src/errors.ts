import type { OutputChannel } from 'vscode';
import { t, type UiLocale } from './i18n';

export type ErrorKind =
  | 'missingKey'
  | 'network'
  | 'httpAuth'
  | 'httpClient'
  | 'httpServer'
  | 'badJson'
  | 'selection'
  | 'unknown';

const NETWORK_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN']);

const DETAIL_MAX_LEN = 500;
const TOAST_DETAIL_MAX_LEN = 180;

let channel: OutputChannel | undefined;

function loadVscode(): typeof import('vscode') {
  // Lazy load so classify/format helpers stay testable outside the extension host.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('vscode') as typeof import('vscode');
}

export function getOutputChannel(): OutputChannel {
  const vscode = loadVscode();
  channel ??= vscode.window.createOutputChannel('Code Explain');
  return channel;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function getErrorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

export function classifyError(error: unknown): ErrorKind {
  const message = getErrorMessage(error);
  const code = getErrorCode(error);

  if (/AI API 401|AI API 403|\b401\b|\b403\b/.test(message)) {
    return 'httpAuth';
  }
  if (/AI API 5\d\d|\b5\d\d\b/.test(message)) {
    return 'httpServer';
  }
  if (/AI API 4\d\d/.test(message)) {
    return 'httpClient';
  }
  if (
    /non-JSON|No JSON|Invalid or missing|must be an object|ExplainResult|GradeResult|JSON|must contain|quiz\.|Missing |Invalid /i.test(
      message,
    )
  ) {
    return 'badJson';
  }
  if (
    /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network/i.test(message) ||
    (code !== undefined && NETWORK_CODES.has(code))
  ) {
    return 'network';
  }
  if (/No selection|select code|too long/i.test(message)) {
    return 'selection';
  }
  if (/API Key|api key/i.test(message)) {
    return 'missingKey';
  }
  return 'unknown';
}

export function redactSensitive(text: string): string {
  return text
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/api[_-]?key["']?\s*[:=]\s*["']?[^"',\s}]+/gi, 'api_key=[REDACTED]');
}

function truncateDetail(text: string, maxLen: number): string {
  if (text.length <= maxLen) {
    return text;
  }
  return `${text.slice(0, maxLen)}…`;
}

export function formatFailureMessage(
  error: unknown,
  locale?: UiLocale,
): { kind: ErrorKind; friendly: string; detail: string } {
  const kind = classifyError(error);
  const friendly = t(`error.${kind}`, undefined, locale);
  const rawDetail = redactSensitive(getErrorMessage(error));
  const detail = truncateDetail(rawDetail, DETAIL_MAX_LEN);
  return { kind, friendly, detail };
}

export async function reportFailure(
  error: unknown,
  options?: { locale?: UiLocale },
): Promise<string> {
  const vscode = loadVscode();
  const { kind, friendly, detail } = formatFailureMessage(error, options?.locale);
  const out = getOutputChannel();
  const err = error instanceof Error ? error : new Error(String(error));
  const safeMessage = redactSensitive(err.message);

  out.appendLine(`[${new Date().toISOString()}] kind=${kind}`);
  out.appendLine(safeMessage);
  if (err.stack) {
    out.appendLine(redactSensitive(err.stack));
  }

  const toastDetail = truncateDetail(detail, TOAST_DETAIL_MAX_LEN);
  const toast = toastDetail
    ? `${friendly} ${t('error.detail', { detail: toastDetail }, options?.locale)}`
    : friendly;
  const showLog = t('error.showLog', undefined, options?.locale);
  // Do not await the toast — awaiting blocks callers from updating the Webview
  // (e.g. leaving Explain panel stuck on "loading" until the user dismisses it).
  void vscode.window.showErrorMessage(toast, showLog).then((picked) => {
    if (picked === showLog) {
      out.show(true);
    }
  });
  return friendly;
}
