import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import type * as vscode from 'vscode';
import { getProgressHtml } from '../webview/progressHtml';

test('getProgressHtml uses nonce CSP and exposes progress containers', () => {
  const webview = {
    cspSource: 'vscode-webview://progress-test',
    asWebviewUri(uri: vscode.Uri) {
      return `webview-resource:${uri.path}`;
    },
  } as unknown as vscode.Webview;

  const mediaUri = { path: '/extension/media' } as unknown as vscode.Uri;
  const html = getProgressHtml(webview, mediaUri);

  assert.match(html, /default-src 'none'/);
  assert.match(html, /style-src vscode-webview:\/\/progress-test/);
  assert.match(html, /script-src 'nonce-[^']+'/);
  assert.match(html, /webview-resource:\/extension\/media\/progress\.css/);
  assert.match(html, /webview-resource:\/extension\/media\/progress\.js/);
  assert.match(html, /id="progress-summary"/);
  assert.match(html, /id="knowledge-chart"/);
  assert.match(html, /id="recent-sessions"/);
  assert.match(html, /id="empty-state"/);
  assert.match(html, /id="language-filter"/);
  assert.match(html, /id="tag-filter"/);
  assert.match(html, /__codeExplainI18n/);
  assert.match(html, /"progress\.tagFilterSelectLanguage"/);
  assert.match(html, /id="keyword-filter"/);
  assert.match(html, /data-tab="progress"/);
  assert.match(html, /data-tab="bank"/);
  assert.match(html, /id="bank-list"/);
  assert.match(html, /id="filter-empty-state"/);
});

test('progress script renders weak knowledge first and limits recent sessions', async () => {
  const script = await readFile(path.join(process.cwd(), 'media', 'progress.js'), 'utf8');

  assert.match(script, /\.sort\(\(left, right\) => accuracy\(left\) - accuracy\(right\)/);
  assert.match(script, /\.slice\(-10\)\.reverse\(\)/);
  assert.match(script, /item\.pass/);
  assert.match(script, /item\.stem/);
  assert.match(script, /item\.feedback/);
  assert.match(script, /type: 'clearProgress'/);
  assert.match(script, /clearButton\.disabled = true/);
  assert.match(script, /clearButton\.disabled = false/);
  assert.match(script, /type: 'starToggle'/);
  assert.match(script, /questionId/);
  assert.match(script, /function t\(key, params\)/);
  assert.match(script, /window\.__codeExplainI18n\.locale/);
  assert.match(script, /toLocaleString\(dateLocaleBcp47\(\)\)/);
  assert.doesNotMatch(script, /toLocaleString\('zh-CN'\)/);
  assert.match(script, /t\('progress\.tagFilterSelectLanguage'\)/);
  assert.match(script, /tagFilter\.disabled = !languageSelected/);
  assert.match(script, /collectFilterOptions\(progress, bank, selectedLanguage\)/);
});

test('question bank command is contributed and registered', async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(process.cwd(), 'package.json'), 'utf8'),
  ) as {
    activationEvents: string[];
    contributes: { commands: Array<{ command: string }> };
  };
  const extensionSource = await readFile(
    path.join(process.cwd(), 'src', 'extension.ts'),
    'utf8',
  );

  assert.ok(packageJson.activationEvents.includes('onCommand:codeExplain.openQuestionBank'));
  assert.ok(packageJson.contributes.commands.some(
    ({ command }) => command === 'codeExplain.openQuestionBank',
  ));
  assert.match(extensionSource, /registerCommand\('codeExplain\.openQuestionBank'/);
});

test('regression test command is contributed, registered, and shown in the activity view', async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(process.cwd(), 'package.json'), 'utf8'),
  ) as {
    activationEvents: string[];
    contributes: {
      commands: Array<{ command: string }>;
      viewsWelcome: Array<{ contents: string }>;
    };
  };
  const extensionSource = await readFile(
    path.join(process.cwd(), 'src', 'extension.ts'),
    'utf8',
  );

  assert.ok(packageJson.activationEvents.includes('onCommand:codeExplain.startRegressionTest'));
  assert.ok(packageJson.contributes.commands.some(
    ({ command }) => command === 'codeExplain.startRegressionTest',
  ));
  assert.ok(packageJson.contributes.viewsWelcome.some(
    ({ contents }) => contents.includes('command:codeExplain.startRegressionTest'),
  ));
  assert.match(extensionSource, /registerCommand\('codeExplain\.startRegressionTest'/);
});

test('learning progress activity view has an icon and a registered tree view', async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(process.cwd(), 'package.json'), 'utf8'),
  ) as {
    contributes: {
      viewsContainers: {
        activitybar: Array<{ id: string; icon?: string }>;
      };
    };
  };
  const extensionSource = await readFile(
    path.join(process.cwd(), 'src', 'extension.ts'),
    'utf8',
  );

  const activityContainer = packageJson.contributes.viewsContainers.activitybar
    .find(({ id }) => id === 'codeExplain');
  assert.equal(activityContainer?.icon, 'media/code-explain.svg');
  assert.match(extensionSource, /createTreeView\(\s*'codeExplain\.learningProgress'/);
});

test('persisting a learning session refreshes an open progress panel', async () => {
  const extensionSource = await readFile(
    path.join(process.cwd(), 'src', 'extension.ts'),
    'utf8',
  );
  const persistStart = extensionSource.indexOf('async function persistLearningSession');
  const persistEnd = extensionSource.indexOf('async function clearProgressWithConfirmation');
  const persistFunction = extensionSource.slice(persistStart, persistEnd);

  assert.match(
    persistFunction,
    /resolveExtensionStorageUri[\s\S]*recordLearningSession[\s\S]*upsertQuestionsFromGrade[\s\S]*ProgressPanel\.updateCurrent/,
  );
});

test('AI explain, grade, and regression failures use the classified failure reporter', async () => {
  const extensionSource = await readFile(
    path.join(process.cwd(), 'src', 'extension.ts'),
    'utf8',
  );

  assert.match(
    extensionSource,
    /const msg = await reportFailure\(error\);\s*panel\.showGradeError\(msg\);/,
  );
  assert.match(
    extensionSource,
    /const msg = await reportFailure\(error\);\s*panel\.showError\(msg\);/,
  );
  assert.equal(
    (extensionSource.match(/await reportFailure\(error\)/g) ?? []).length,
    4,
  );
});

test('extension storage helper uses configured root and warns when it falls back', async () => {
  const extensionSource = await readFile(
    path.join(process.cwd(), 'src', 'extension.ts'),
    'utf8',
  );
  const helperStart = extensionSource.indexOf('async function resolveExtensionStorageUri');
  const helperEnd = extensionSource.indexOf('function buildRecordLearningSessionInput');
  const helper = extensionSource.slice(helperStart, helperEnd);

  assert.match(helper, /getConfiguration\('codeExplain'\)/);
  assert.match(helper, /get<string>\('storageRoot'\)/);
  assert.match(helper, /resolveStorageDir\(context\.globalStorageUri\.fsPath/);
  assert.match(helper, /usedFallback[\s\S]*showWarningMessage/);
  assert.match(helper, /vscode\.Uri\.file\(result\.dir\)/);
});
