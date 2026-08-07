import * as vscode from 'vscode';
import { resolveUiLocale, t } from '../i18n';
import type { RegressionAnswers, RegressionPaper } from '../regressionTypes';
import type { GradeResult } from '../types';
import { getRegressionHtml } from './regressionHtml';

type WebviewMessage =
  | { type: 'paperReady'; paper: RegressionPaper }
  | { type: 'gradeLoading' }
  | { type: 'gradeReady'; result: GradeResult }
  | { type: 'gradeError'; message: string };

export class RegressionPanel implements vscode.Disposable {
  private static currentPanel: RegressionPanel | undefined;

  private paper: RegressionPaper;
  private readonly submitEmitter = new vscode.EventEmitter<RegressionAnswers>();
  readonly onDidSubmit = this.submitEmitter.event;
  private readonly disposeEmitter = new vscode.EventEmitter<void>();
  readonly onDidDispose = this.disposeEmitter.event;
  private readonly disposables: vscode.Disposable[] = [this.submitEmitter, this.disposeEmitter];

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly mediaUri: vscode.Uri,
    paper: RegressionPaper,
  ) {
    this.paper = paper;
    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (message: unknown) => {
        if (typeof message !== 'object' || message === null) {
          return;
        }
        const type = (message as { type?: unknown }).type;
        if (type === 'ready') {
          void this.postPaper();
        } else if (
          type === 'submitRegression' &&
          typeof (message as { answers?: unknown }).answers === 'object'
        ) {
          this.submitEmitter.fire(
            (message as { answers: RegressionAnswers }).answers,
          );
        }
      },
      undefined,
      this.disposables,
    );
  }

  static show(context: vscode.ExtensionContext, paper: RegressionPaper): RegressionPanel {
    const mediaUri = vscode.Uri.joinPath(context.extensionUri, 'media');
    const locale = resolveUiLocale(vscode.env.language);
    if (RegressionPanel.currentPanel) {
      RegressionPanel.currentPanel.paper = paper;
      RegressionPanel.currentPanel.panel.reveal(vscode.ViewColumn.Beside);
      // Avoid full html refresh on reuse — it races with postMessage updates.
      RegressionPanel.currentPanel.panel.webview.postMessage({ type: 'paperReady', paper });
      return RegressionPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'codeExplainRegressionTest',
      t('panel.regression.title', undefined, locale),
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        localResourceRoots: [mediaUri],
      },
    );
    const regressionPanel = new RegressionPanel(panel, mediaUri, paper);
    RegressionPanel.currentPanel = regressionPanel;
    regressionPanel.refresh();
    return regressionPanel;
  }

  showLoadingGrade(): void {
    void this.postMessage({ type: 'gradeLoading' });
  }

  showGrade(result: GradeResult): void {
    void this.postMessage({ type: 'gradeReady', result });
  }

  showGradeError(message: string): void {
    void this.postMessage({ type: 'gradeError', message });
  }

  dispose(): void {
    if (RegressionPanel.currentPanel === this) {
      RegressionPanel.currentPanel = undefined;
    }
    this.disposeEmitter.fire();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }

  private refresh(): void {
    const locale = resolveUiLocale(vscode.env.language);
    this.panel.webview.html = getRegressionHtml(this.panel.webview, this.mediaUri, locale);
  }

  private postPaper(): Thenable<boolean> {
    return this.postMessage({ type: 'paperReady', paper: this.paper });
  }

  private postMessage(message: WebviewMessage): Thenable<boolean> {
    return this.panel.webview.postMessage(message);
  }
}
