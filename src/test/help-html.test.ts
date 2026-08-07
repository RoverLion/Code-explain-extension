import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildHelpHtmlDocument } from '../webview/helpHtml';

describe('help html', () => {
  it('includes locale toggle and both guide roots', () => {
    const html = buildHelpHtmlDocument({
      cspSource: 'https://csp.example',
      stylesheetHref: 'help.css',
      scriptHref: 'help.js',
      nonce: 'testnonce',
      defaultLocale: 'zh-cn',
      messagesEn: { 'guide.title': 'User Guide', 'guide.langToggle.label': 'Guide language' },
      messagesZh: { 'guide.title': '使用说明', 'guide.langToggle.label': '说明语言' },
    });

    assert.match(html, /data-locale="en"/);
    assert.match(html, /data-locale="zh-cn"/);
    assert.match(html, /__codeExplainI18n/);
    assert.match(html, /data-i18n="guide\.section\.language"/);
    assert.match(html, /lang-toggle/);
  });
});
