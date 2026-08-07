import * as vscode from 'vscode';

import type { ExplainResult, GradeResult } from './types';
import { ExplainAgentSession } from './agentClient';
import { clearLearningProgress, loadLearningProgress, recordLearningSession } from './learningStore';
import type { LearningProgressFile, RecordLearningSessionInput } from './learningTypes';
import {
  buildExplainPrompt,
  buildGradePrompt,
  buildRegressionGradePrompt,
} from './prompts';
import {
  loadQuestionBank,
  setQuestionStarred,
  upsertQuestionsFromGrade,
  upsertRegressionQuestionsFromGrade,
} from './questionBankStore';
import { assembleRegressionPaper, listLearnedLanguageIds } from './regressionAssembler';
import type { RegressionPaper } from './regressionTypes';
import { resolveAiProviderConfig, setApiKey } from './secrets';
import { collectExplainRequest, SelectionError } from './selection';
import { resolveStorageDir } from './storagePaths';
import { reportFailure } from './errors';
import { t } from './i18n';
import { ExplainPanel } from './webview/ExplainPanel';
import { HelpPanel } from './webview/HelpPanel';
import { ProgressPanel } from './webview/ProgressPanel';
import { RegressionPanel } from './webview/RegressionPanel';



let activeSession: ExplainAgentSession | undefined;
let lastExplainResult: ExplainResult | undefined;
let panelDisposeSubscription: vscode.Disposable | undefined;
let quizSubmitSubscription: vscode.Disposable | undefined;
let previewQuizSubscription: vscode.Disposable | undefined;
let regressionPanelDisposeSubscription: vscode.Disposable | undefined;
let regressionSubmitSubscription: vscode.Disposable | undefined;

async function disposeActiveSession(): Promise<void> {
  const session = activeSession;
  activeSession = undefined;
  lastExplainResult = undefined;
  if (session) {
    await session.dispose();
  }
}

function showCommandError(message: string): void {
  void vscode.window.showErrorMessage(message);
}

async function resolveExtensionStorageUri(
  context: vscode.ExtensionContext,
): Promise<vscode.Uri> {
  const storageRoot = vscode.workspace
    .getConfiguration('codeExplain')
    .get<string>('storageRoot') ?? '';
  const result = await resolveStorageDir(context.globalStorageUri.fsPath, storageRoot);
  if (result.usedFallback) {
    void vscode.window.showWarningMessage(result.warning ?? t('storage.fallbackWarning'));
  }
  return vscode.Uri.file(result.dir);
}

function buildRecordLearningSessionInput(
  explain: ExplainResult,
  grade: GradeResult,
): RecordLearningSessionInput {
  const stemById = new Map<string, string>();
  for (const choice of explain.quiz.choices) {
    stemById.set(choice.id, choice.stem);
  }
  for (const short of explain.quiz.shorts) {
    stemById.set(short.id, short.stem);
  }

  return {
    filePath: explain.meta.filePath,
    languageId: explain.meta.languageId,
    title: explain.meta.title,
    summary: explain.meta.summary,
    knowledge: explain.knowledge.map(({ id, title, tags }) => ({ id, title, tags })),
    quizItems: grade.items.map((item) => ({
      id: item.id,
      type: item.type,
      pass: item.pass,
      feedback: item.feedback,
      stem: stemById.get(item.id),
    })),
    score: grade.score,
  };
}

async function persistLearningSession(
  context: vscode.ExtensionContext,
  explain: ExplainResult,
  grade: GradeResult,
): Promise<void> {
  try {
    const storageUri = await resolveExtensionStorageUri(context);
    const progress = await recordLearningSession(
      storageUri,
      buildRecordLearningSessionInput(explain, grade),
    );
    const session = progress.sessions.at(-1);
    const bank = await upsertQuestionsFromGrade(
      storageUri,
      explain,
      grade,
      session?.id,
      session?.at,
    );
    ProgressPanel.updateCurrent(progress, bank);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    void vscode.window.showWarningMessage(t('progress.saveFailed', { detail }));
  }
}

function buildRegressionRecordInput(
  paper: RegressionPaper,
  grade: GradeResult,
): RecordLearningSessionInput {
  const knowledge = new Map<string, { id: string; title: string; tags?: string[] }>();
  const itemById = new Map(paper.items.map((item) => [item.id, item]));
  for (const item of paper.items) {
    for (const title of item.knowledgeTitles) {
      const key = `${item.languageId}|${title.trim().toLowerCase()}`;
      const entry: { id: string; title: string; tags?: string[] } = {
        id: `regression:${key}`,
        title,
      };
      if (item.tags?.length) {
        entry.tags = [...item.tags];
      }
      knowledge.set(key, entry);
    }
  }

  return {
    filePath: 'code-explain://regression',
    languageId: paper.languageFilter,
    title: t('regression.title'),
    summary: t('regression.completedSummary', { count: paper.items.length }),
    knowledge: [...knowledge.values()],
    quizItems: grade.items.map((item) => ({
      id: item.id,
      type: item.type,
      pass: item.pass,
      feedback: item.feedback,
      stem: itemById.get(item.id)?.stem,
    })),
    score: grade.score,
  };
}

async function persistRegressionSession(
  context: vscode.ExtensionContext,
  paper: RegressionPaper,
  grade: GradeResult,
): Promise<void> {
  try {
    const storageUri = await resolveExtensionStorageUri(context);
    const progress = await recordLearningSession(
      storageUri,
      buildRegressionRecordInput(paper, grade),
    );
    const learningSession = progress.sessions.at(-1);
    const bank = await upsertRegressionQuestionsFromGrade(
      storageUri,
      paper,
      grade,
      learningSession?.id,
      learningSession?.at,
    );
    ProgressPanel.updateCurrent(progress, bank);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    void vscode.window.showWarningMessage(t('regression.saveFailed', { detail }));
  }
}

async function clearProgressWithConfirmation(
  context: vscode.ExtensionContext,
): Promise<LearningProgressFile | undefined> {
  const confirmed = await vscode.window.showWarningMessage(
    t('progress.clearConfirm'),
    { modal: true },
    t('progress.clearAction'),
  );
  if (confirmed !== t('progress.clearAction')) {
    return undefined;
  }

  try {
    const storageUri = await resolveExtensionStorageUri(context);
    await clearLearningProgress(storageUri);
    const progress = await loadLearningProgress(storageUri);
    ProgressPanel.updateCurrent(progress);
    void vscode.window.showInformationMessage(t('progress.cleared'));
    return progress;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    showCommandError(t('progress.clearFailed', { detail }));
    return undefined;
  }
}

async function showLearningProgress(
  context: vscode.ExtensionContext,
  activeTab: 'progress' | 'bank' = 'progress',
): Promise<void> {
  try {
    const storageUri = await resolveExtensionStorageUri(context);
    const [progress, bank] = await Promise.all([
      loadLearningProgress(storageUri),
      loadQuestionBank(storageUri),
    ]);
    ProgressPanel.show(
      context,
      progress,
      bank,
      activeTab,
      () => clearProgressWithConfirmation(context),
      (questionId, starred) => setQuestionStarred(storageUri, questionId, starred),
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    showCommandError(t('progress.loadFailed', { detail }));
  }
}

async function explainSelection(context: vscode.ExtensionContext): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) {
    showCommandError(t('error.selection'));
    return;
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    showCommandError(t('error.workspaceMissing'));
    return;
  }

  const provider = await resolveAiProviderConfig(context);
  if (!provider) {
    showCommandError(t('error.missingKey'));
    return;
  }

  let request;
  let outputLanguage: string;
  try {
    const config = vscode.workspace.getConfiguration('codeExplain');
    outputLanguage = config.get<string>('outputLanguage') ?? 'zh-CN';
    request = collectExplainRequest(
      editor,
      workspaceRoot,
      config.get<number>('maxSelectionChars') ?? 12000,
      config.get<number>('maxFileChars') ?? 40000,
    );
  } catch (error) {
    if (error instanceof SelectionError) {
      const message = /too long/i.test(error.message)
        ? t('error.selectionTooLong')
        : t('error.selection');
      showCommandError(message);
      return;
    }
    showCommandError(t('error.selectionRead'));
    return;
  }

  await disposeActiveSession();
  panelDisposeSubscription?.dispose();
  quizSubmitSubscription?.dispose();
  previewQuizSubscription?.dispose();

  const panel = ExplainPanel.show(context);
  const session = new ExplainAgentSession({
    apiKey: provider.apiKey,
    modelId: provider.model,
    baseUrl: provider.baseUrl,
  });
  activeSession = session;

  panelDisposeSubscription = panel.onDidDispose(() => {
    if (activeSession === session) {
      void disposeActiveSession();
    }
  });
  quizSubmitSubscription = panel.onDidSubmitQuiz(async (answers) => {
    const explain = lastExplainResult;
    if (activeSession !== session || !explain) {
      panel.showGradeError(t('error.explainRequired'));
      return;
    }

    panel.showLoadingGrade();
    try {
      const grade = await session.grade(
        buildGradePrompt({ explain, answers, outputLanguage }),
      );
      if (activeSession === session) {
        panel.showGrade(grade);
        await persistLearningSession(context, explain, grade);
      }
    } catch (error) {
      if (activeSession === session) {
        const msg = await reportFailure(error);
        panel.showGradeError(msg);
      }
    }
  });

  panel.showLoading();
  try {
    const result = await session.explain(buildExplainPrompt(request, outputLanguage));
    if (activeSession !== session) {
      return;
    }
    lastExplainResult = result;
    panel.showExplain(result);
  } catch (error) {
    if (activeSession === session) {
      const msg = await reportFailure(error);
      panel.showError(msg);
    }
  }
}

async function startRegressionTest(context: vscode.ExtensionContext): Promise<void> {
  const provider = await resolveAiProviderConfig(context);
  if (!provider) {
    showCommandError(t('error.missingKey'));
    return;
  }

  try {
    const storageUri = await resolveExtensionStorageUri(context);
    const [progress, bank] = await Promise.all([
      loadLearningProgress(storageUri),
      loadQuestionBank(storageUri),
    ]);
    const languages = listLearnedLanguageIds(progress, bank);
    if (languages.length === 0) {
      showCommandError(t('regression.noLearnedLanguages'));
      return;
    }

    const selected = await vscode.window.showQuickPick(
      [
        { label: t('regression.allLanguages'), value: 'all' as const },
        ...languages.map((languageId) => ({ label: languageId, value: languageId })),
      ],
      {
        title: t('regression.languagePickerTitle'),
        placeHolder: t('regression.allLanguages'),
        ignoreFocusOut: true,
      },
    );
    if (!selected) {
      return;
    }

    const languageFilter: string | 'all' = selected.value;
    const hasMatchingBankQuestion = bank.questions.some(
      (question) => languageFilter === 'all' || question.languageId === languageFilter,
    );
    if (!hasMatchingBankQuestion) {
      void vscode.window.showInformationMessage(
        t('regression.emptyQuestionBank'),
      );
    }

    await disposeActiveSession();
    regressionPanelDisposeSubscription?.dispose();
    regressionSubmitSubscription?.dispose();

    const session = new ExplainAgentSession({
      apiKey: provider.apiKey,
      modelId: provider.model,
      baseUrl: provider.baseUrl,
    });
    activeSession = session;
    const outputLanguage =
      vscode.workspace.getConfiguration('codeExplain').get<string>('outputLanguage') ?? 'zh-CN';
    let paper: RegressionPaper;
    try {
      paper = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: t('regression.generating'),
          cancellable: false,
        },
        () =>
          assembleRegressionPaper({
            progress,
            bank,
            languageFilter,
            outputLanguage,
            generateAiItems: (prompt) => session.generateRegressionPaper(prompt),
          }),
      );
    } catch (error) {
      if (activeSession === session) {
        await disposeActiveSession();
      }
      await reportFailure(error);
      return;
    }

    if (activeSession !== session) {
      return;
    }
    const panel = RegressionPanel.show(context, paper);
    regressionPanelDisposeSubscription = panel.onDidDispose(() => {
      if (activeSession === session) {
        void disposeActiveSession();
      }
    });
    regressionSubmitSubscription = panel.onDidSubmit(async (answers) => {
      if (activeSession !== session) {
        panel.showGradeError(t('regression.sessionExpired'));
        return;
      }
      panel.showLoadingGrade();
      try {
        const grade = await session.grade(
          buildRegressionGradePrompt({ paper, answers, outputLanguage }),
        );
        if (activeSession === session) {
          panel.showGrade(grade);
          await persistRegressionSession(context, paper, grade);
        }
      } catch (error) {
        if (activeSession === session) {
          const msg = await reportFailure(error);
          panel.showGradeError(msg);
        }
      }
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    showCommandError(t('regression.startFailed', { detail }));
  }
}

async function promptForApiKey(context: vscode.ExtensionContext): Promise<void> {
  const apiKey = await vscode.window.showInputBox({
    title: t('apiKey.title'),
    prompt: t('apiKey.prompt'),
    password: true,
    ignoreFocusOut: true,
    placeHolder: 'sk-...',
    validateInput: (value) => (value.trim() ? undefined : t('apiKey.empty')),
  });

  if (apiKey === undefined) {
    return;
  }

  const trimmed = apiKey.trim();
  try {
    await setApiKey(context, trimmed);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    showCommandError(t('apiKey.saveFailed', { detail }));
    return;
  }

  const saved = await resolveAiProviderConfig(context);
  if (!saved?.apiKey) {
    showCommandError(t('apiKey.notSaved'));
    return;
  }

  void vscode.window.showInformationMessage(
    t('apiKey.saved'),
  );
}

async function setApiBaseUrlCommand(): Promise<void> {
  const config = vscode.workspace.getConfiguration('codeExplain');
  const current = config.get<string>('apiBaseUrl') ?? '';
  const value = await vscode.window.showInputBox({
    title: t('config.apiBaseUrl.title'),
    prompt: t('config.apiBaseUrl.prompt'),
    value: current,
    ignoreFocusOut: true,
    validateInput: (input) => {
      const trimmed = input.trim();
      if (!trimmed) {
        return t('config.apiBaseUrl.empty');
      }
      try {
        const url = new URL(trimmed);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          return t('config.apiBaseUrl.invalid');
        }
      } catch {
        return t('config.apiBaseUrl.invalid');
      }
      return undefined;
    },
  });
  if (value === undefined) {
    return;
  }

  const normalized = value.trim().replace(/\/+$/, '') || value.trim();
  await config.update('apiBaseUrl', normalized, vscode.ConfigurationTarget.Global);
  void vscode.window.showInformationMessage(t('config.apiBaseUrl.saved'));
}


function createPreviewExplainResult(): ExplainResult {

  return {

    meta: {

      title: 'Preview: const declaration',

      languageId: 'typescript',

      filePath: 'src/example.ts',

      summary: 'This snippet declares a constant and assigns a numeric literal.',

    },

    lines: [

      {

        line: 1,

        code: 'const x = 1;',

        meaning: 'Declares a block-scoped constant `x` initialized to 1.',

      },

      {

        line: 2,

        code: 'console.log(x);',

        meaning: 'Prints the value of `x` to the console.',

      },

    ],

    knowledge: [

      {

        id: 'k1',

        title: 'const',

        body: 'Creates a block-scoped binding that cannot be reassigned.',

        tags: ['javascript', 'scope'],

      },

      {

        id: 'k2',

        title: 'Numeric literals',

        body: 'Numbers like 1 are primitive values of type number.',

        tags: ['types'],

      },

    ],

    quiz: {

      choices: [

        {

          id: 'c1',

          stem: 'What does const prevent?',

          options: ['Reassignment', 'Hoisting', 'Shadowing', 'Mutation of object fields'],

        },

        {

          id: 'c2',

          stem: 'What is the type of 1 in TypeScript?',

          options: ['number', 'int', 'float', 'any'],

        },

        {

          id: 'c3',

          stem: 'Where is x visible?',

          options: ['Block scope', 'Function scope', 'Global only', 'Module scope only'],

        },

      ],

      shorts: [

        {

          id: 's1',

          stem: 'In one sentence, what does this code do?',

          hint: 'Mention const and logging.',

        },

      ],

    },

  };

}



function createPreviewGradeResult(): GradeResult {

  return {

    score: { correct: 3, total: 4, percent: 75 },

    items: [

      { id: 'c1', type: 'choice', pass: true, feedback: 'Correct — const bindings cannot be reassigned.' },

      { id: 'c2', type: 'choice', pass: true, feedback: 'Correct — numeric literals are typed as number.' },

      { id: 'c3', type: 'choice', pass: false, feedback: 'x is block-scoped within its enclosing block.' },

      { id: 's1', type: 'short', pass: true, feedback: 'Good summary of declaring and logging a constant.' },

    ],

  };

}



export function activate(context: vscode.ExtensionContext) {
  const learningProgressTree = vscode.window.createTreeView(
    'codeExplain.learningProgress',
    {
      treeDataProvider: {
        getTreeItem: (item: vscode.TreeItem) => item,
        getChildren: () => [],
      },
    },
  );

  context.subscriptions.push(
    learningProgressTree,

    vscode.commands.registerCommand('codeExplain.setApiKey', async () => {
      await promptForApiKey(context);
    }),

    vscode.commands.registerCommand('codeExplain.setApiBaseUrl', async () => {
      await setApiBaseUrlCommand();
    }),

    vscode.commands.registerCommand('codeExplain.openUserGuide', () => {
      HelpPanel.show(context);
    }),

    vscode.commands.registerCommand('codeExplain.explainSelection', async () => {
      await explainSelection(context);
    }),

    vscode.commands.registerCommand('codeExplain.showLearningProgress', async () => {
      await showLearningProgress(context);
    }),

    vscode.commands.registerCommand('codeExplain.openQuestionBank', async () => {
      await showLearningProgress(context, 'bank');
    }),

    vscode.commands.registerCommand('codeExplain.startRegressionTest', async () => {
      await startRegressionTest(context);
    }),

    vscode.commands.registerCommand('codeExplain.clearLearningProgress', async () => {
      await clearProgressWithConfirmation(context);
    }),

    vscode.commands.registerCommand('codeExplain.previewWebview', async () => {

      await disposeActiveSession();

      panelDisposeSubscription?.dispose();

      quizSubmitSubscription?.dispose();

      previewQuizSubscription?.dispose();

      const panel = ExplainPanel.show(context);

      panel.showExplain(createPreviewExplainResult());

      previewQuizSubscription = panel.onDidSubmitQuiz(() => {

        panel.showGrade(createPreviewGradeResult());

      });

    }),

  );

}



export async function deactivate() {

  panelDisposeSubscription?.dispose();

  quizSubmitSubscription?.dispose();

  previewQuizSubscription?.dispose();

  regressionPanelDisposeSubscription?.dispose();

  regressionSubmitSubscription?.dispose();

  await disposeActiveSession();

}
