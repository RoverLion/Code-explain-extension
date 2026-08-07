import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectExplainRequest, SelectionError } from '../selection';

interface MockEditor {
  document: {
    uri: { fsPath: string };
    languageId: string;
    getText: (range?: unknown) => string;
  };
  selection: {
    isEmpty: boolean;
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

function mockEditor(overrides: {
  fsPath?: string;
  languageId?: string;
  fullText?: string;
  selectionText?: string;
  isEmpty?: boolean;
  startLine?: number;
  endLine?: number;
  startCharacter?: number;
  endCharacter?: number;
}): MockEditor {
  const fullText = overrides.fullText ?? 'line0\nline1\nline2\n';
  const selectionText = overrides.selectionText ?? 'line1';
  const isEmpty = overrides.isEmpty ?? false;
  const startLine = overrides.startLine ?? 1;
  const endLine = overrides.endLine ?? 1;
  const startCharacter = overrides.startCharacter ?? 0;
  const endCharacter = overrides.endCharacter ?? selectionText.length;

  return {
    document: {
      uri: { fsPath: overrides.fsPath ?? '/repo/src/a.ts' },
      languageId: overrides.languageId ?? 'typescript',
      getText: (range?: unknown) => (range ? selectionText : fullText),
    },
    selection: {
      isEmpty,
      start: { line: startLine, character: startCharacter },
      end: { line: endLine, character: endCharacter },
    },
  };
}

test('collectExplainRequest returns ExplainRequest for valid selection', () => {
  const req = collectExplainRequest(
    mockEditor({}) as Parameters<typeof collectExplainRequest>[0],
    '/repo',
    12000,
    40000,
  );
  assert.equal(req.workspaceRoot, '/repo');
  assert.equal(req.filePath, 'src/a.ts');
  assert.equal(req.languageId, 'typescript');
  assert.equal(req.selectionText, 'line1');
  assert.deepEqual(req.selectionRange, {
    startLine: 1,
    endLine: 1,
    startCharacter: 0,
    endCharacter: 5,
  });
  assert.ok(req.fileText?.includes('line0'));
});

test('collectExplainRequest throws when selection is empty', () => {
  assert.throws(
    () =>
      collectExplainRequest(
        mockEditor({ isEmpty: true, selectionText: '' }) as Parameters<typeof collectExplainRequest>[0],
        '/repo',
        12000,
        40000,
      ),
    SelectionError,
  );
});

test('collectExplainRequest rejects selection exceeding maxSelectionChars', () => {
  const longSelection = 'x'.repeat(101);
  assert.throws(
    () =>
      collectExplainRequest(
        mockEditor({ selectionText: longSelection, endCharacter: longSelection.length }) as Parameters<
          typeof collectExplainRequest
        >[0],
        '/repo',
        100,
        40000,
      ),
    /too long/i,
  );
});

test('collectExplainRequest truncates oversized fileText with head and tail marker', () => {
  const fullText = 'H'.repeat(50) + 'M'.repeat(50) + 'T'.repeat(50);
  const req = collectExplainRequest(
    mockEditor({ fullText, selectionText: 'M', startLine: 0, endLine: 0, endCharacter: 1 }) as Parameters<
      typeof collectExplainRequest
    >[0],
    '/repo',
    12000,
    80,
  );
  assert.ok(req.fileText?.includes('...(truncated)...'));
  assert.ok(req.fileText?.startsWith('H'));
  assert.ok(req.fileText?.endsWith('T'));
  assert.ok((req.fileText?.length ?? 0) <= 80);
});
