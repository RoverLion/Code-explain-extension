import * as vscode from 'vscode';
import { resolveUiLocale, t } from '../i18n';
import type { LearningProgressFile } from '../learningTypes';
import type { QuestionBankFile } from '../questionBankTypes';
import { getProgressHtml } from './progressHtml';

type ClearProgressHandler = () => Promise<LearningProgressFile | undefined>;
type StarToggleHandler = (questionId: string, starred: boolean) => Promise<QuestionBankFile>;
export type ProgressPanelTab = 'progress' | 'bank';

export class ProgressPanel implements vscode.Disposable {
  private static currentPanel: ProgressPanel | undefined;

  private progress: LearningProgressFile;
  private bank: QuestionBankFile;
  private activeTab: ProgressPanelTab;
  private clearProgressHandler: ClearProgressHandler;
  private starToggleHandler: StarToggleHandler;
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly mediaUri: vscode.Uri,
    progress: LearningProgressFile,
    bank: QuestionBankFile,
    activeTab: ProgressPanelTab,
    clearProgressHandler: ClearProgressHandler,
    starToggleHandler: StarToggleHandler,
  ) {
    this.progress = progress;
    this.bank = bank;
    this.activeTab = activeTab;
    this.clearProgressHandler = clearProgressHandler;
    this.starToggleHandler = starToggleHandler;
    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      async (message: unknown) => {
        if (typeof message !== 'object' || message === null) {
          return;
        }

        const type = (message as { type?: unknown }).type;
        if (type === 'ready') {
          await this.postProgress(this.activeTab);
        } else if (type === 'clearProgress') {
          const cleared = await this.clearProgressHandler();
          if (cleared) {
            this.update(cleared);
          } else {
            await this.postProgress();
          }
        } else if (type === 'starToggle') {
          const { questionId, starred } = message as {
            questionId?: unknown;
            starred?: unknown;
          };
          if (typeof questionId === 'string' && typeof starred === 'boolean') {
            try {
              this.bank = await this.starToggleHandler(questionId, starred);
            } catch (error) {
              const detail = error instanceof Error ? error.message : String(error);
              void vscode.window.showWarningMessage(t(
                'progress.starUpdateFailed',
                { detail },
                resolveUiLocale(vscode.env.language),
              ));
            }
            await this.postProgress();
          }
        }
      },
      undefined,
      this.disposables,
    );
  }

  static show(
    context: vscode.ExtensionContext,
    progress: LearningProgressFile,
    bank: QuestionBankFile,
    activeTab: ProgressPanelTab,
    clearProgressHandler: ClearProgressHandler,
    starToggleHandler: StarToggleHandler,
  ): ProgressPanel {
    const mediaUri = vscode.Uri.joinPath(context.extensionUri, 'media');
    const locale = resolveUiLocale(vscode.env.language);
    if (ProgressPanel.currentPanel) {
      ProgressPanel.currentPanel.progress = progress;
      ProgressPanel.currentPanel.bank = bank;
      ProgressPanel.currentPanel.activeTab = activeTab;
      ProgressPanel.currentPanel.clearProgressHandler = clearProgressHandler;
      ProgressPanel.currentPanel.starToggleHandler = starToggleHandler;
      ProgressPanel.currentPanel.panel.reveal(vscode.ViewColumn.Beside);
      void ProgressPanel.currentPanel.postProgress(activeTab);
      return ProgressPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'codeExplainLearningProgress',
      t('panel.progress.title', undefined, locale),
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        localResourceRoots: [mediaUri],
      },
    );
    const progressPanel = new ProgressPanel(
      panel,
      mediaUri,
      progress,
      bank,
      activeTab,
      clearProgressHandler,
      starToggleHandler,
    );
    ProgressPanel.currentPanel = progressPanel;
    progressPanel.refresh();
    return progressPanel;
  }

  static updateCurrent(progress: LearningProgressFile, bank?: QuestionBankFile): void {
    ProgressPanel.currentPanel?.update(progress, bank);
  }

  update(progress: LearningProgressFile, bank?: QuestionBankFile): void {
    this.progress = progress;
    if (bank) {
      this.bank = bank;
    }
    void this.postProgress();
  }

  dispose(): void {
    if (ProgressPanel.currentPanel === this) {
      ProgressPanel.currentPanel = undefined;
    }
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }

  private refresh(): void {
    const locale = resolveUiLocale(vscode.env.language);
    this.panel.webview.html = getProgressHtml(this.panel.webview, this.mediaUri, locale);
  }

  private postProgress(activeTab?: ProgressPanelTab): Thenable<boolean> {
    return this.panel.webview.postMessage({
      type: 'progressReady',
      progress: this.progress,
      bank: this.bank,
      activeTab,
    });
  }
}
