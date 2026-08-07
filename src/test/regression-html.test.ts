import assert from 'node:assert/strict';
import { test } from 'node:test';
import type * as vscode from 'vscode';
import { getRegressionHtml } from '../webview/regressionHtml';

test('getRegressionHtml uses nonce CSP and regression media resources', () => {
  const webview = {
    cspSource: 'vscode-webview://regression',
    asWebviewUri(uri: vscode.Uri) {
      return `webview-resource:${uri.path}`;
    },
  } as unknown as vscode.Webview;
  const mediaUri = { path: '/extension/media' } as unknown as vscode.Uri;

  const html = getRegressionHtml(webview, mediaUri);

  assert.match(html, /default-src 'none'/);
  assert.match(html, /style-src vscode-webview:\/\/regression/);
  assert.match(html, /script-src 'nonce-[^']+'/);
  assert.match(html, /webview-resource:\/extension\/media\/regression\.css/);
  assert.match(html, /webview-resource:\/extension\/media\/regression\.js/);
  assert.match(html, /<main id="app"/);
  assert.match(html, /__codeExplainI18n/);
  assert.match(html, /"regression\.loadingPaper"/);
  assert.doesNotMatch(html, /unsafe-inline/);
});
