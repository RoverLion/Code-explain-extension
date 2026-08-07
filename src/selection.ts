import * as path from 'node:path';
import * as vscode from 'vscode';
import type { ExplainRequest } from './types';

const TRUNCATION_MARKER = '...(truncated)...';

export class SelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SelectionError';
  }
}

function toPosixRelative(workspaceRoot: string, absolutePath: string): string {
  return path.relative(workspaceRoot, absolutePath).split(path.sep).join('/');
}

function truncateFileText(text: string, maxFileChars: number): string {
  if (text.length <= maxFileChars) {
    return text;
  }
  const budget = maxFileChars - TRUNCATION_MARKER.length;
  if (budget <= 0) {
    return TRUNCATION_MARKER.slice(0, maxFileChars);
  }
  const headSize = Math.ceil(budget / 2);
  const tailSize = budget - headSize;
  return text.slice(0, headSize) + TRUNCATION_MARKER + text.slice(text.length - tailSize);
}

export function collectExplainRequest(
  editor: vscode.TextEditor,
  workspaceRoot: string,
  maxSelectionChars: number,
  maxFileChars: number,
): ExplainRequest {
  const { document, selection } = editor;

  if (selection.isEmpty) {
    throw new SelectionError('No selection: select code in the editor first.');
  }

  const selectionText = document.getText(selection);
  if (selectionText.length > maxSelectionChars) {
    throw new SelectionError(
      `Selection is too long (${selectionText.length} chars). Maximum allowed is ${maxSelectionChars}.`,
    );
  }

  const fileText = truncateFileText(document.getText(), maxFileChars);

  return {
    workspaceRoot,
    filePath: toPosixRelative(workspaceRoot, document.uri.fsPath),
    languageId: document.languageId,
    selectionText,
    selectionRange: {
      startLine: selection.start.line,
      endLine: selection.end.line,
      startCharacter: selection.start.character,
      endCharacter: selection.end.character,
    },
    fileText,
  };
}
