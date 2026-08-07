import * as vscode from 'vscode';
import { resolveUiLocale, t } from '../i18n';
import { getHelpHtml } from './helpHtml';

export class HelpPanel {
  private static currentPanel: HelpPanel | undefined;

  private constructor(private readonly panel: vscode.WebviewPanel) {
    panel.onDidDispose(() => {
      if (HelpPanel.currentPanel === this) {
        HelpPanel.currentPanel = undefined;
      }
    });
  }

  static show(context: vscode.ExtensionContext): HelpPanel {
    if (HelpPanel.currentPanel) {
      HelpPanel.currentPanel.panel.reveal(vscode.ViewColumn.Beside);
      return HelpPanel.currentPanel;
    }

    const locale = resolveUiLocale(vscode.env.language);
    const mediaUri = vscode.Uri.joinPath(context.extensionUri, 'media');
    const panel = vscode.window.createWebviewPanel(
      'codeExplainUserGuide',
      t('guide.title', undefined, locale),
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        localResourceRoots: [mediaUri],
      },
    );
    panel.webview.html = getHelpHtml(panel.webview, mediaUri, locale);
    const helpPanel = new HelpPanel(panel);
    HelpPanel.currentPanel = helpPanel;
    return helpPanel;
  }
}
