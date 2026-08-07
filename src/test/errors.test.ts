import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyError, formatFailureMessage } from '../errors';

describe('classifyError', () => {
  it('detects http auth', () => {
    assert.equal(classifyError(new Error('AI API 401: unauthorized')), 'httpAuth');
  });
  it('detects http server', () => {
    assert.equal(classifyError(new Error('AI API 502: bad gateway')), 'httpServer');
  });
  it('detects bad json', () => {
    assert.equal(classifyError(new Error('No JSON object found in text')), 'badJson');
    assert.equal(classifyError(new Error('AI API returned non-JSON response')), 'badJson');
    assert.equal(
      classifyError(new Error('quiz.choices must contain at least 1 item')),
      'badJson',
    );
  });
  it('detects network', () => {
    assert.equal(classifyError(new Error('fetch failed')), 'network');
    assert.equal(classifyError(Object.assign(new Error('boom'), { code: 'ECONNREFUSED' })), 'network');
  });
});

describe('formatFailureMessage', () => {
  it('includes friendly text and truncated detail', () => {
    const r = formatFailureMessage(new Error('AI API 401: secret-should-stay'), 'en');
    assert.equal(r.kind, 'httpAuth');
    assert.ok(r.friendly.length > 0);
    assert.match(r.detail, /401/);
  });

  it('redacts OpenAI-style keys and api_key values from detail', () => {
    const r = formatFailureMessage(
      new Error('AI API 401: api_key="secret-value" key=sk-test_123'),
      'en',
    );
    assert.doesNotMatch(r.detail, /secret-value|sk-test_123/);
    assert.match(r.detail, /\[REDACTED\]/);
  });
});
