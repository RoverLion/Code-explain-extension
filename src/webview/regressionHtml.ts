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

export function getRegressionHtml(
  webview: vscode.Webview,
  mediaUri: vscode.Uri,
  locale: UiLocale = 'en',
): string {
  const nonce = createNonce();
  const messages = getMessages(locale);
  const stylesheetUri = webview.asWebviewUri({
    ...mediaUri,
    path: `${mediaUri.path}/regression.css`,
  } as vscode.Uri);
  const scriptUri = webview.asWebviewUri({
    ...mediaUri,
    path: `${mediaUri.path}/regression.js`,
  } as vscode.Uri);

  return /* html */ `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${stylesheetUri}">
  <title>${messages['regression.title']}</title>
</head>
<body>
  <main id="app" aria-live="polite">
    <section class="state-card">
      <h1>${messages['regression.title']}</h1>
      <p class="muted">${messages['regression.loadingPaper']}</p>
    </section>
  </main>
  <script nonce="${nonce}">window.__codeExplainI18n = ${serializeForScript({ locale, messages })};</script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
