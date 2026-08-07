import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveApiKeyFromSources } from '../secrets';

function createSecrets(map: Record<string, string | undefined>) {
  return {
    get: async (name: string) => map[name],
  };
}

test('resolveApiKeyFromSources prefers new SecretStorage over legacy and settings', async () => {
  const key = await resolveApiKeyFromSources(
    createSecrets({
      'codeExplain.apiKey': 'secret-key',
      'codeExplain.cursorApiKey': 'legacy-secret',
    }),
    () => 'setting-key',
    () => 'legacy-setting',
    { OPENAI_API_KEY: 'environment-key' },
  );

  assert.equal(key, 'secret-key');
});

test('resolveApiKeyFromSources falls back through settings and environment', async () => {
  const settingsKey = await resolveApiKeyFromSources(
    createSecrets({}),
    () => 'setting-key',
    () => undefined,
    { OPENAI_API_KEY: 'environment-key' },
  );
  const openaiEnv = await resolveApiKeyFromSources(
    createSecrets({}),
    () => undefined,
    () => undefined,
    { OPENAI_API_KEY: 'openai-key', CURSOR_API_KEY: 'cursor-key' },
  );
  const legacyEnv = await resolveApiKeyFromSources(
    createSecrets({}),
    () => undefined,
    () => undefined,
    { CURSOR_API_KEY: 'cursor-key' },
  );

  assert.equal(settingsKey, 'setting-key');
  assert.equal(openaiEnv, 'openai-key');
  assert.equal(legacyEnv, 'cursor-key');
});
