import type * as vscode from 'vscode';

const API_KEY_SECRET = 'codeExplain.apiKey';
/** @deprecated migrated from Cursor-only config */
const LEGACY_API_KEY_SECRET = 'codeExplain.cursorApiKey';

export interface AiProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function normalizeApiBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : 'https://api.openai.com/v1';
}

export async function resolveApiKeyFromSources(
  secrets: Pick<vscode.SecretStorage, 'get'>,
  getSetting: () => string | undefined,
  getLegacySetting: () => string | undefined,
  environment: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  return (
    nonEmpty(await secrets.get(API_KEY_SECRET)) ||
    nonEmpty(await secrets.get(LEGACY_API_KEY_SECRET)) ||
    nonEmpty(getSetting()) ||
    nonEmpty(getLegacySetting()) ||
    nonEmpty(environment.CODE_EXPLAIN_API_KEY) ||
    nonEmpty(environment.OPENAI_API_KEY) ||
    nonEmpty(environment.CURSOR_API_KEY)
  );
}

export async function resolveApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
  const vscodeApi = require('vscode') as typeof import('vscode');
  const config = vscodeApi.workspace.getConfiguration('codeExplain');

  return resolveApiKeyFromSources(
    context.secrets,
    () => config.get<string>('apiKey'),
    () => config.get<string>('cursorApiKey'),
    process.env,
  );
}

export async function resolveAiProviderConfig(
  context: vscode.ExtensionContext,
): Promise<AiProviderConfig | undefined> {
  const vscodeApi = require('vscode') as typeof import('vscode');
  const config = vscodeApi.workspace.getConfiguration('codeExplain');
  const apiKey = await resolveApiKey(context);
  if (!apiKey) {
    return undefined;
  }

  return {
    apiKey,
    baseUrl: normalizeApiBaseUrl(config.get<string>('apiBaseUrl') ?? 'https://api.openai.com/v1'),
    model: nonEmpty(config.get<string>('model')) ?? 'gpt-4o-mini',
  };
}

/**
 * Persist API key to SecretStorage and Global settings so it survives
 * hosts where SecretStorage alone is flaky or hard to verify in UI.
 */
export async function setApiKey(context: vscode.ExtensionContext, key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) {
    throw new Error('API Key 不能为空');
  }

  await context.secrets.store(API_KEY_SECRET, trimmed);

  const vscodeApi = require('vscode') as typeof import('vscode');
  await vscodeApi.workspace
    .getConfiguration('codeExplain')
    .update('apiKey', trimmed, vscodeApi.ConfigurationTarget.Global);
}
