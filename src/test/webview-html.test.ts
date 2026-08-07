import assert from 'node:assert/strict';
import { test } from 'node:test';
import type * as vscode from 'vscode';
import { getWebviewHtml } from '../webview/html';

test('getWebviewHtml uses nonce CSP and local media resources', () => {
  const webview = {
    cspSource: 'vscode-webview://test',
    asWebviewUri(uri: vscode.Uri) {
      return `webview-resource:${uri.path}`;
    },
  } as unknown as vscode.Webview;

  const mediaUri = { path: '/extension/media' } as unknown as vscode.Uri;
  const html = getWebviewHtml(webview, mediaUri);

  assert.match(html, /default-src 'none'/);
  assert.match(html, /style-src vscode-webview:\/\/test/);
  assert.match(html, /script-src 'nonce-[^']+'/);
  assert.match(html, /webview-resource:\/extension\/media\/webview\.css/);
  assert.match(html, /webview-resource:\/extension\/media\/webview\.js/);
  assert.match(html, /<main id="app"/);
  assert.match(html, /__codeExplainI18n/);
  assert.match(html, /"explain\.waiting"/);
});
