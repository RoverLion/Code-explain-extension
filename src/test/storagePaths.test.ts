import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { resolveStorageDir } from '../storagePaths';

test('resolveStorageDir uses globalStorage when setting is empty', async () => {
  const globalPath = '/global/storage';

  const result = await resolveStorageDir(globalPath, '');

  assert.equal(result.dir, globalPath);
  assert.equal(result.usedFallback, false);
  assert.equal(result.warning, undefined);
});

test('resolveStorageDir uses globalStorage when setting is whitespace only', async () => {
  const globalPath = '/global/storage';

  const result = await resolveStorageDir(globalPath, '   ');

  assert.equal(result.dir, globalPath);
  assert.equal(result.usedFallback, false);
  assert.equal(result.warning, undefined);
});

test('resolveStorageDir creates and uses absolute custom path', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'code-explain-storage-'));
  const globalPath = path.join(base, 'global');
  const customPath = path.join(base, 'custom-root');

  try {
    const result = await resolveStorageDir(globalPath, customPath);

    assert.equal(result.dir, customPath);
    assert.equal(result.usedFallback, false);
    assert.equal(result.warning, undefined);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('resolveStorageDir falls back when setting is not absolute', async () => {
  const globalPath = '/global/storage';

  const result = await resolveStorageDir(globalPath, 'relative/custom');

  assert.equal(result.dir, globalPath);
  assert.equal(result.usedFallback, true);
  assert.match(result.warning ?? '', /absolute/i);
});

test('resolveStorageDir falls back when custom path cannot be created', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'code-explain-storage-'));
  const globalPath = path.join(base, 'global');
  const blocker = path.join(base, 'blocker');
  const customPath = path.join(blocker, 'nested');

  await writeFile(blocker, 'not a directory');

  try {
    const result = await resolveStorageDir(globalPath, customPath);

    assert.equal(result.dir, globalPath);
    assert.equal(result.usedFallback, true);
    assert.match(result.warning ?? '', /invalid storage root/i);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
