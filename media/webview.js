(() => {
  const vscode = acquireVsCodeApi();
  const app = document.getElementById('app');

  function t(key, params) {
    const table = (window.__codeExplainI18n && window.__codeExplainI18n.messages) || {};
    let text = table[key] || key;
    if (params) {
      for (const name of Object.keys(params)) {
        text = text.split(`{${name}}`).join(String(params[name]));
      }
    }
    return text;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderLoading() {
    app.innerHTML = `
      <section class="state-card">
        <h1>${t('explain.loading.title')}</h1>
        <p class="muted">${t('explain.loading.body')}</p>
      </section>`;
  }

  function renderError(message) {
    app.innerHTML = `
      <section class="state-card error" role="alert">
        <h1>${t('explain.error.title')}</h1>
        <p>${escapeHtml(message)}</p>
      </section>`;
  }

  function renderExplain(result) {
    const lines = result.lines.map((line) => `
      <article class="line-row">
        <code class="line-code"><span class="line-number">L${escapeHtml(line.line)}</span> ${escapeHtml(line.code)}</code>
        <p>${escapeHtml(line.meaning)}</p>
      </article>`).join('');
    const knowledge = result.knowledge.map((item) => `
      <article class="knowledge-card">
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.body)}</p>
        ${item.tags && item.tags.length ? `<div class="tags">${item.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
      </article>`).join('');
    const choices = result.quiz.choices.map((question) => `
      <fieldset class="question">
        <legend>${escapeHtml(question.stem)}</legend>
        <div class="options">
          ${question.options.map((option, index) => `
            <label class="option">
              <input type="radio" name="choice-${escapeHtml(question.id)}" value="${index}">
              <span>${escapeHtml(option)}</span>
            </label>`).join('')}
        </div>
      </fieldset>`).join('');
    const shorts = result.quiz.shorts.map((question) => `
      <fieldset class="question">
        <legend>${escapeHtml(question.stem)}</legend>
        ${question.hint ? `<p class="muted">${escapeHtml(question.hint)}</p>` : ''}
        <textarea name="short-${escapeHtml(question.id)}" aria-label="${escapeHtml(question.stem)}"></textarea>
      </fieldset>`).join('');

    app.innerHTML = `
      <header class="topbar">
        <p class="eyebrow">${escapeHtml(result.meta.languageId)} · ${escapeHtml(result.meta.filePath)}</p>
        <h1>${escapeHtml(result.meta.title)}</h1>
        <p class="summary">${escapeHtml(result.meta.summary)}</p>
      </header>
      <section class="section">
        <h2>${t('explain.lineByLine')}</h2>
        <div class="lines">${lines}</div>
      </section>
      <section class="section">
        <h2>${t('explain.knowledgePoints')}</h2>
        <div class="knowledge">${knowledge}</div>
      </section>
      <section class="section quiz">
        <h2>${t('explain.checkUnderstanding')}</h2>
        <form class="quiz-form">
          ${choices}
          ${shorts}
          <button type="submit">${t('common.submitForGrading')}</button>
        </form>
      </section>
      <section class="section grade" hidden></section>`;

    app.querySelector('.quiz-form').addEventListener('submit', submitQuiz);
  }

  function submitQuiz(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const answers = { choices: {}, shorts: {} };

    form.querySelectorAll('input[name^="choice-"]:checked').forEach((input) => {
      answers.choices[input.name.slice('choice-'.length)] = Number(input.value);
    });
    form.querySelectorAll('textarea[name^="short-"]').forEach((input) => {
      answers.shorts[input.name.slice('short-'.length)] = input.value;
    });

    form.querySelectorAll('input, textarea, button').forEach((control) => {
      control.disabled = true;
    });
    vscode.postMessage({ type: 'submitQuiz', answers });
  }

  function renderGrade(result) {
    const grade = app.querySelector('.grade');
    if (!grade) {
      return;
    }

    grade.hidden = false;
    grade.innerHTML = `
      <h2>${t('explain.gradeResult')}</h2>
      <p class="grade-summary">${escapeHtml(result.score.percent)}% (${escapeHtml(result.score.correct)}/${escapeHtml(result.score.total)})</p>
      ${result.items.map((item) => `
        <p class="feedback ${item.pass ? 'ok' : 'bad'}">
          <strong>${item.pass ? t('explain.correct') : t('common.needsImprovement')}。</strong> ${escapeHtml(item.feedback)}
        </p>`).join('')}
      <button type="button" class="clear-grade">${t('explain.clearGrade')}</button>`;
    grade.querySelector('.clear-grade').addEventListener('click', clearGradeAndRetry);
    grade.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function clearGradeAndRetry() {
    const grade = app.querySelector('.grade');
    const form = app.querySelector('.quiz-form');
    if (!grade || !form) {
      return;
    }

    form.querySelectorAll('input, textarea, button').forEach((control) => {
      control.disabled = false;
    });
    grade.hidden = true;
    grade.innerHTML = '';
  }

  function renderGradeLoading() {
    const grade = app.querySelector('.grade');
    if (!grade) {
      return;
    }

    grade.hidden = false;
    grade.innerHTML = `<p class="muted">${t('explain.gradeLoading')}</p>`;
  }

  function renderGradeError(message) {
    const grade = app.querySelector('.grade');
    const form = app.querySelector('.quiz-form');
    if (!grade || !form) {
      renderError(message);
      return;
    }

    form.querySelectorAll('input, textarea, button').forEach((control) => {
      control.disabled = false;
    });
    grade.hidden = false;
    grade.innerHTML = `<p class="feedback bad" role="alert">${escapeHtml(message)}</p>`;
  }

  window.addEventListener('message', (event) => {
    const message = event.data;
    switch (message.type) {
      case 'loading':
        renderLoading();
        break;
      case 'explainReady':
        renderExplain(message.result);
        break;
      case 'explainError':
        renderError(message.message);
        break;
      case 'gradeLoading':
        renderGradeLoading();
        break;
      case 'gradeError':
        renderGradeError(message.message);
        break;
      case 'gradeReady':
        renderGrade(message.result);
        break;
    }
  });
})();
