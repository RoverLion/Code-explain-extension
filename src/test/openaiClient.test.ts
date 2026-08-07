import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildChatCompletionsUrl, extractAssistantContent } from '../openaiClient';
import { normalizeApiBaseUrl } from '../secrets';

test('buildChatCompletionsUrl appends path once', () => {
  assert.equal(
    buildChatCompletionsUrl('https://api.openai.com/v1'),
    'https://api.openai.com/v1/chat/completions',
  );
  assert.equal(
    buildChatCompletionsUrl('https://api.openai.com/v1/'),
    'https://api.openai.com/v1/chat/completions',
  );
  assert.equal(
    buildChatCompletionsUrl('https://gateway.example/v1/chat/completions'),
    'https://gateway.example/v1/chat/completions',
  );
});

test('normalizeApiBaseUrl strips trailing slash and defaults', () => {
  assert.equal(normalizeApiBaseUrl('https://api.deepseek.com/v1/'), 'https://api.deepseek.com/v1');
  assert.equal(normalizeApiBaseUrl('   '), 'https://api.openai.com/v1');
});

test('extractAssistantContent reads string and multipart content', () => {
  assert.equal(
    extractAssistantContent({
      choices: [{ message: { content: '{"ok":true}' } }],
    }),
    '{"ok":true}',
  );
  assert.equal(
    extractAssistantContent({
      choices: [{ message: { content: [{ text: '{' }, { text: '}' }] } }],
    }),
    '{}',
  );
  assert.equal(extractAssistantContent({ choices: [] }), undefined);
});
