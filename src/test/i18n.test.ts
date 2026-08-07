import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveUiLocale, t, getMessages } from '../i18n/index';

describe('resolveUiLocale', () => {
  it('maps zh* to zh-cn', () => {
    assert.equal(resolveUiLocale('zh-cn'), 'zh-cn');
    assert.equal(resolveUiLocale('zh-TW'), 'zh-cn');
  });
  it('defaults non-zh to en', () => {
    assert.equal(resolveUiLocale('en'), 'en');
    assert.equal(resolveUiLocale('ja'), 'en');
    assert.equal(resolveUiLocale(undefined), 'en');
  });
});

describe('t', () => {
  it('interpolates params for en', () => {
    assert.match(t('error.detail', { detail: 'boom' }, 'en'), /boom/);
  });
  it('provides API base URL command messages in both catalogs', () => {
    for (const locale of ['en', 'zh-cn'] as const) {
      assert.notEqual(t('config.apiBaseUrl.title', undefined, locale), 'config.apiBaseUrl.title');
      assert.notEqual(t('config.apiBaseUrl.prompt', undefined, locale), 'config.apiBaseUrl.prompt');
      assert.notEqual(t('config.apiBaseUrl.empty', undefined, locale), 'config.apiBaseUrl.empty');
      assert.notEqual(t('config.apiBaseUrl.invalid', undefined, locale), 'config.apiBaseUrl.invalid');
      assert.notEqual(t('config.apiBaseUrl.saved', undefined, locale), 'config.apiBaseUrl.saved');
    }
  });
  it('returns key when missing', () => {
    assert.equal(t('does.not.exist', undefined, 'en'), 'does.not.exist');
  });
  it('loads both catalogs with shared keys', () => {
    const en = getMessages('en');
    const zh = getMessages('zh-cn');
    for (const key of Object.keys(en)) {
      assert.ok(key in zh, `missing zh key: ${key}`);
    }
  });
  it('returns an independent catalog copy', () => {
    const messages = getMessages('en');
    messages['test.mutable'] = 'temporary';
    assert.equal(getMessages('en')['test.mutable'], undefined);
  });
});
