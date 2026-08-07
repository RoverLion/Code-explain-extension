import { randomBytes } from 'node:crypto';
import type * as vscode from 'vscode';
import { getMessages, type UiLocale } from '../i18n';

type HelpHtmlOptions = {
  cspSource: string;
  stylesheetHref: string;
  scriptHref: string;
  nonce: string;
  defaultLocale: UiLocale;
  messagesEn: Record<string, string>;
  messagesZh: Record<string, string>;
};

function createNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(32);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

function serializeForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function guideArticle(locale: UiLocale, defaultLocale: UiLocale): string {
  return `<article id="guide-${locale}" data-locale="${locale}"${locale === defaultLocale ? '' : ' hidden'}>
    <section>
      <h2 data-i18n="guide.section.quickStart"></h2>
      <p data-i18n="guide.quickStart.body"></p>
    </section>
    <section>
      <h2 data-i18n="guide.section.configureAi"></h2>
      <p data-i18n="guide.configureAi.body"></p>
    </section>
    <section>
      <h2 data-i18n="guide.section.language"></h2>
      <p data-i18n="guide.language.body"></p>
    </section>
    <section>
      <h2 data-i18n="guide.section.features"></h2>
      <p data-i18n="guide.features.body"></p>
    </section>
    <section>
      <h2 data-i18n="guide.section.troubleshooting"></h2>
      <p data-i18n="guide.troubleshooting.body"></p>
    </section>
    <section>
      <h2 data-i18n="guide.section.notes"></h2>
      <p data-i18n="guide.notes.body"></p>
    </section>
  </article>`;
}

export function buildHelpHtmlDocument(options: HelpHtmlOptions): string {
  const i18n = serializeForScript({
    locale: options.defaultLocale,
    messages: {
      en: options.messagesEn,
      'zh-cn': options.messagesZh,
    },
  });

  return /* html */ `<!DOCTYPE html>
<html lang="${options.defaultLocale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${options.cspSource}; script-src 'nonce-${options.nonce}';">
  <link rel="stylesheet" href="${options.stylesheetHref}">
  <title>Code Explain</title>
</head>
<body>
  <main id="app">
    <header>
      <div>
        <p class="eyebrow">Code Explain</p>
        <h1 data-i18n="guide.title"></h1>
      </div>
      <div class="lang-toggle-wrap">
        <span class="lang-toggle-label" data-i18n="guide.langToggle.label"></span>
        <div class="lang-toggle" role="group" aria-label="Language">
          <button type="button" data-set-locale="zh-cn">中文</button>
          <button type="button" data-set-locale="en">English</button>
        </div>
      </div>
    </header>
    ${guideArticle('zh-cn', options.defaultLocale)}
    ${guideArticle('en', options.defaultLocale)}
  </main>
  <script nonce="${options.nonce}">window.__codeExplainI18n = ${i18n};</script>
  <script nonce="${options.nonce}" src="${options.scriptHref}"></script>
</body>
</html>`;
}

export function getHelpHtml(
  webview: vscode.Webview,
  mediaUri: vscode.Uri,
  defaultLocale: UiLocale,
): string {
  const stylesheetUri = webview.asWebviewUri({
    ...mediaUri,
    path: `${mediaUri.path}/help.css`,
  } as vscode.Uri);
  const scriptUri = webview.asWebviewUri({
    ...mediaUri,
    path: `${mediaUri.path}/help.js`,
  } as vscode.Uri);
  return buildHelpHtmlDocument({
    cspSource: webview.cspSource,
    stylesheetHref: stylesheetUri.toString(),
    scriptHref: scriptUri.toString(),
    nonce: createNonce(),
    defaultLocale,
    messagesEn: getMessages('en'),
    messagesZh: getMessages('zh-cn'),
  });
}
