import { mkdir } from 'node:fs/promises';
import path from 'node:path';

export interface ResolveStorageDirResult {
  dir: string;
  usedFallback: boolean;
  warning?: string;
}

export async function resolveStorageDir(
  globalStorageFsPath: string,
  storageRootSetting: string,
): Promise<ResolveStorageDirResult> {
  const trimmed = storageRootSetting.trim();
  if (!trimmed) {
    return { dir: globalStorageFsPath, usedFallback: false };
  }

  if (!path.isAbsolute(trimmed)) {
    return {
      dir: globalStorageFsPath,
      usedFallback: true,
      warning: `Invalid storage root "${trimmed}": path must be absolute. Using extension global storage.`,
    };
  }

  try {
    await mkdir(trimmed, { recursive: true });
    return { dir: trimmed, usedFallback: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      dir: globalStorageFsPath,
      usedFallback: true,
      warning: `Invalid storage root "${trimmed}": ${message}. Using extension global storage.`,
    };
  }
}
