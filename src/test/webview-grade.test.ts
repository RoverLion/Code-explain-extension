import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const webviewScript = path.join(process.cwd(), 'media', 'webview.js');

test('quiz submission localizes the grading state and restores the quiz after grading errors', async () => {
  const script = await readFile(webviewScript, 'utf8');

  assert.match(script, /function renderGradeLoading\(\)/);
  assert.match(script, /t\('explain\.gradeLoading'\)/);
  assert.match(script, /function renderGradeError\(message\)/);
  assert.match(script, /form\.querySelectorAll\('input, textarea, button'\).*disabled = false/s);
  assert.match(script, /case 'gradeLoading':\s+renderGradeLoading\(\);/);
  assert.match(script, /case 'gradeError':\s+renderGradeError\(message\.message\);/);
});

test('successful grading offers a clear-and-retry action that restores the quiz form', async () => {
  const script = await readFile(webviewScript, 'utf8');

  assert.match(script, /t\('explain\.clearGrade'\)/);
  assert.match(script, /function clearGradeAndRetry\(\)/);
  assert.match(script, /form\.querySelectorAll\('input, textarea, button'\).*disabled = false/s);
  assert.match(script, /grade\.hidden = true/);
});
