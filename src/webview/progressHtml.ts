import { randomBytes } from 'node:crypto';
import type * as vscode from 'vscode';
import { getMessages, type UiLocale } from '../i18n';

function createNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(32);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

function serializeForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function getProgressHtml(
  webview: vscode.Webview,
  mediaUri: vscode.Uri,
  locale: UiLocale = 'en',
): string {
  const nonce = createNonce();
  const messages = getMessages(locale);
  const stylesheetUri = webview.asWebviewUri({
    ...mediaUri,
    path: `${mediaUri.path}/progress.css`,
  } as vscode.Uri);
  const scriptUri = webview.asWebviewUri({
    ...mediaUri,
    path: `${mediaUri.path}/progress.js`,
  } as vscode.Uri);

  return /* html */ `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${stylesheetUri}">
  <title>${messages['progress.title']}</title>
</head>
<body>
  <main id="app" aria-live="polite">
    <header class="topbar">
      <div>
        <p class="eyebrow">Code Explain</p>
        <h1>${messages['progress.title']}</h1>
      </div>
      <button id="clear-progress" type="button">${messages['progress.clear']}</button>
    </header>
    <section id="empty-state" class="state-card" hidden>
      <h2>${messages['progress.empty.title']}</h2>
      <p>${messages['progress.empty.body']}</p>
    </section>
    <div id="data-content" hidden>
      <section class="filter-bar" aria-label="${messages['progress.filter']}">
        <label>
          <span>${messages['progress.language']}</span>
          <select id="language-filter"><option value="">${messages['progress.allLanguages']}</option></select>
        </label>
        <label>
          <span>${messages['progress.tag']}</span>
          <select id="tag-filter" disabled><option value="">${messages['progress.tagFilterSelectLanguage']}</option></select>
        </label>
        <label class="keyword-field">
          <span>${messages['progress.keyword']}</span>
          <input id="keyword-filter" type="search" placeholder="${messages['progress.keywordPlaceholder']}">
        </label>
      </section>
      <nav class="tabs" aria-label="${messages['progress.view']}">
        <button class="tab is-active" type="button" role="tab" data-tab="progress" aria-selected="true">${messages['progress.mastery']}</button>
        <button class="tab" type="button" role="tab" data-tab="bank" aria-selected="false">${messages['progress.questionBank']}</button>
      </nav>
      <section id="filter-empty-state" class="state-card compact" hidden>
        <h2>${messages['progress.noMatches.title']}</h2>
        <p>${messages['progress.noMatches.body']}</p>
      </section>
      <div id="progress-content" role="tabpanel">
        <section id="progress-summary" class="summary-grid" aria-label="${messages['progress.summary']}"></section>
        <section class="section">
          <h2>${messages['progress.knowledgeMastery']}</h2>
          <p class="muted">${messages['progress.knowledgeMasteryHint']}</p>
          <div id="knowledge-chart" class="knowledge-chart"></div>
        </section>
        <section class="section">
          <h2>${messages['progress.recentLearning']}</h2>
          <div id="recent-sessions" class="session-list"></div>
        </section>
      </div>
      <div id="bank-content" role="tabpanel" hidden>
        <section class="section">
          <div class="section-heading">
            <div>
              <h2>${messages['progress.localQuestionBank']}</h2>
              <p class="muted">${messages['progress.questionBankHint']}</p>
            </div>
            <span id="bank-count" class="count-badge"></span>
          </div>
          <div id="bank-list" class="bank-list"></div>
        </section>
      </div>
    </div>
  </main>
  <script nonce="${nonce}">window.__codeExplainI18n = ${serializeForScript({ locale, messages })};</script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
