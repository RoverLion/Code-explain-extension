import * as vscode from 'vscode';
import { resolveUiLocale, t } from '../i18n';
import type { ExplainResult, GradeResult, QuizAnswers } from '../types';
import { getWebviewHtml } from './html';

type WebviewMessage =
  | { type: 'loading' }
  | { type: 'explainReady'; result: ExplainResult }
  | { type: 'explainError'; message: string }
  | { type: 'gradeLoading' }
  | { type: 'gradeReady'; result: GradeResult }
  | { type: 'gradeError'; message: string };

export class ExplainPanel implements vscode.Disposable {
  private static currentPanel: ExplainPanel | undefined;

  private readonly submitQuizEmitter = new vscode.EventEmitter<QuizAnswers>();
  readonly onDidSubmitQuiz = this.submitQuizEmitter.event;
  private readonly disposeEmitter = new vscode.EventEmitter<void>();
  readonly onDidDispose = this.disposeEmitter.event;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly mediaUri: vscode.Uri,
  ) {
    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (message: unknown) => {
        if (
          typeof message === 'object' &&
          message !== null &&
          (message as { type?: unknown }).type === 'submitQuiz' &&
          typeof (message as { answers?: unknown }).answers === 'object'
        ) {
          this.submitQuizEmitter.fire((message as { answers: QuizAnswers }).answers);
        }
      },
      undefined,
      this.disposables,
    );
  }

  private readonly disposables: vscode.Disposable[] = [this.submitQuizEmitter, this.disposeEmitter];

  static show(context: vscode.ExtensionContext): ExplainPanel {
    const mediaUri = vscode.Uri.joinPath(context.extensionUri, 'media');
    const locale = resolveUiLocale(vscode.env.language);
    if (ExplainPanel.currentPanel) {
      // Reuse the live webview without resetting html — a full refresh races with
      // subsequent postMessage(loading/result) and can leave the UI stuck on loading.
      ExplainPanel.currentPanel.panel.reveal(vscode.ViewColumn.Beside);
      return ExplainPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'codeExplain',
      t('panel.explain.title', undefined, locale),
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        localResourceRoots: [mediaUri],
      },
    );
    const explainPanel = new ExplainPanel(panel, mediaUri);
    ExplainPanel.currentPanel = explainPanel;
    explainPanel.refresh();
    return explainPanel;
  }

  showLoading(): void {
    void this.postMessage({ type: 'loading' });
  }

  showExplain(result: ExplainResult): void {
    void this.postMessage({ type: 'explainReady', result });
  }

  showGrade(result: GradeResult): void {
    void this.postMessage({ type: 'gradeReady', result });
  }

  showLoadingGrade(): void {
    void this.postMessage({ type: 'gradeLoading' });
  }

  showError(message: string): void {
    void this.postMessage({ type: 'explainError', message });
  }

  showGradeError(message: string): void {
    void this.postMessage({ type: 'gradeError', message });
  }

  dispose(): void {
    if (ExplainPanel.currentPanel === this) {
      ExplainPanel.currentPanel = undefined;
    }
    this.disposeEmitter.fire();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }

  private refresh(): void {
    const locale = resolveUiLocale(vscode.env.language);
    this.panel.webview.html = getWebviewHtml(this.panel.webview, this.mediaUri, locale);
  }

  private postMessage(message: WebviewMessage): Thenable<boolean> {
    return this.panel.webview.postMessage(message);
  }
}
