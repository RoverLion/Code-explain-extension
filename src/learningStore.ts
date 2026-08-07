import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type * as vscode from 'vscode';
import {
  emptyLearningProgress,
  type KnowledgeStat,
  type LearningProgressFile,
  type LearningSession,
  type RecordLearningSessionInput,
} from './learningTypes';

const PROGRESS_FILENAME = 'learning-progress.json';
const PASS_THRESHOLD_PERCENT = 60;
const DEFAULT_MAX_SESSIONS = 100;

function progressFilePath(storageUri: vscode.Uri): string {
  return path.join(storageUri.fsPath, PROGRESS_FILENAME);
}

export function normalizeKnowledgeKey(title: string): string {
  return title.trim().toLowerCase();
}

export function knowledgeStatKey(languageId: string, title: string): string {
  return `${normalizeKnowledgeKey(languageId)}|${normalizeKnowledgeKey(title)}`;
}

export function applySessionToStats(
  stats: Record<string, KnowledgeStat>,
  languageId: string,
  sessionKnowledge: Array<{ id: string; title: string; tags?: string[] }>,
  percent: number,
  at: string,
): Record<string, KnowledgeStat> {
  const updated: Record<string, KnowledgeStat> = { ...stats };
  const passed = percent >= PASS_THRESHOLD_PERCENT;

  for (const item of sessionKnowledge) {
    const key = knowledgeStatKey(languageId, item.title);
    const existing = updated[key];
    const next: KnowledgeStat = existing
      ? { ...existing }
      : { title: item.title, languageId, correct: 0, wrong: 0, lastAt: at, lastPass: passed };

    if (passed) {
      next.correct += 1;
      next.lastPass = true;
    } else {
      next.wrong += 1;
      next.lastPass = false;
    }

    next.lastAt = at;
    next.title = item.title;
    if (item.tags !== undefined) {
      next.tags = item.tags;
    }

    updated[key] = next;
  }

  return updated;
}

export function truncateSessions(sessions: LearningSession[], max = DEFAULT_MAX_SESSIONS): LearningSession[] {
  if (sessions.length <= max) {
    return sessions;
  }
  return sessions.slice(sessions.length - max);
}

async function saveLearningProgress(storageUri: vscode.Uri, data: LearningProgressFile): Promise<void> {
  await mkdir(storageUri.fsPath, { recursive: true });
  await writeFile(progressFilePath(storageUri), JSON.stringify(data, null, 2), 'utf8');
}

export function migrateProgressToV2(raw: unknown): LearningProgressFile {
  if (!isProgressShape(raw)) {
    throw new Error('Invalid learning progress file');
  }
  if (raw.version === 2) {
    return raw as LearningProgressFile;
  }

  const sessions = raw.sessions.map((session) => ({
    ...session,
    languageId: validLanguageId(session.languageId),
  }));
  let knowledgeStats: Record<string, KnowledgeStat> = {};
  const linkedTitles = new Set<string>();

  for (const session of sessions) {
    for (const item of session.knowledge) {
      linkedTitles.add(normalizeKnowledgeKey(item.title));
    }
    knowledgeStats = applySessionToStats(
      knowledgeStats,
      session.languageId,
      session.knowledge,
      session.score.percent,
      session.at,
    );
  }

  for (const value of Object.values(raw.knowledgeStats)) {
    if (!isLegacyKnowledgeStat(value) || linkedTitles.has(normalizeKnowledgeKey(value.title))) {
      continue;
    }
    knowledgeStats[knowledgeStatKey('unknown', value.title)] = {
      ...value,
      languageId: 'unknown',
    };
  }

  return { version: 2, sessions, knowledgeStats };
}

export async function loadLearningProgress(storageUri: vscode.Uri): Promise<LearningProgressFile> {
  try {
    const raw = await readFile(progressFilePath(storageUri), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    const progress = migrateProgressToV2(parsed);
    if (isVersionedProgress(parsed) && parsed.version !== 2) {
      await saveLearningProgress(storageUri, progress);
    }
    return progress;
  } catch (error) {
    if (isMissingFileError(error)) {
      return emptyLearningProgress();
    }
    throw error;
  }
}

export async function recordLearningSession(
  storageUri: vscode.Uri,
  input: RecordLearningSessionInput,
): Promise<LearningProgressFile> {
  const existing = await loadLearningProgress(storageUri);
  const at = new Date().toISOString();
  const session: LearningSession = {
    id: randomUUID(),
    at,
    ...input,
  };

  const sessions = truncateSessions([...existing.sessions, session]);
  const knowledgeStats = applySessionToStats(
    existing.knowledgeStats,
    input.languageId,
    input.knowledge,
    input.score.percent,
    at,
  );

  const data: LearningProgressFile = {
    version: 2,
    sessions,
    knowledgeStats,
  };

  await saveLearningProgress(storageUri, data);
  return data;
}

export async function clearLearningProgress(storageUri: vscode.Uri): Promise<void> {
  await saveLearningProgress(storageUri, emptyLearningProgress());
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

function isVersionedProgress(value: unknown): value is { version: unknown } {
  return typeof value === 'object' && value !== null && 'version' in value;
}

function isProgressShape(
  value: unknown,
): value is { version: unknown; sessions: LearningSession[]; knowledgeStats: Record<string, unknown> } {
  return (
    isVersionedProgress(value) &&
    'sessions' in value &&
    Array.isArray(value.sessions) &&
    'knowledgeStats' in value &&
    typeof value.knowledgeStats === 'object' &&
    value.knowledgeStats !== null
  );
}

function validLanguageId(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value : 'unknown';
}

function isLegacyKnowledgeStat(value: unknown): value is Omit<KnowledgeStat, 'languageId'> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'title' in value &&
    typeof value.title === 'string' &&
    'correct' in value &&
    typeof value.correct === 'number' &&
    'wrong' in value &&
    typeof value.wrong === 'number' &&
    'lastAt' in value &&
    typeof value.lastAt === 'string' &&
    'lastPass' in value &&
    typeof value.lastPass === 'boolean'
  );
}
