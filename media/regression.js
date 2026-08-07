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

  function questionTypeLabel(type) {
    if (type === 'choice') {
      return t('regression.choiceQuestion');
    }
    if (type === 'code') {
      return t('regression.codeQuestion');
    }
    return t('regression.shortQuestion');
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderPaper(paper) {
    const questions = paper.items.map((item, index) => {
      const tags = [item.languageId, ...(item.knowledgeTitles || [])]
        .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
        .join('');
      let answer = '';
      if (item.type === 'choice') {
        answer = `<div class="options">${(item.options || []).map((option, optionIndex) => `
          <label class="option">
            <input type="radio" name="choice-${escapeHtml(item.id)}" value="${optionIndex}">
            <span>${escapeHtml(option)}</span>
          </label>`).join('')}</div>`;
      } else {
        const codeClass = item.type === 'code' ? ' code-answer' : '';
        const placeholder = item.type === 'code'
          ? t('regression.codePlaceholder')
          : t('regression.answerPlaceholder');
        answer = `<textarea class="${codeClass}" name="text-${escapeHtml(item.id)}" placeholder="${placeholder}" aria-label="${escapeHtml(item.stem)}"></textarea>`;
      }
      return `
        <fieldset class="question" data-question-id="${escapeHtml(item.id)}">
          <legend><span class="question-number">${index + 1}</span>${escapeHtml(item.stem)}</legend>
          <div class="tags">${tags}<span class="tag type">${escapeHtml(questionTypeLabel(item.type))}</span></div>
          ${answer}
          <div class="item-feedback" hidden></div>
        </fieldset>`;
    }).join('');

    app.innerHTML = `
      <header class="topbar">
        <p class="eyebrow">${t('regression.webviewEyebrow')}</p>
        <h1>${t('regression.title')}</h1>
        <p class="muted">${paper.languageFilter === 'all' ? t('regression.allLanguages') : escapeHtml(paper.languageFilter)} · ${t('regression.questionCount', { count: paper.items.length })}</p>
      </header>
      <form class="regression-form">
        ${questions}
        <button type="submit">${t('common.submitForGrading')}</button>
      </form>
      <section class="grade section" hidden></section>`;
    app.querySelector('.regression-form').addEventListener('submit', submitPaper);
  }

  function submitPaper(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const answers = { choices: {}, texts: {} };
    form.querySelectorAll('input[name^="choice-"]:checked').forEach((input) => {
      answers.choices[input.name.slice('choice-'.length)] = Number(input.value);
    });
    form.querySelectorAll('textarea[name^="text-"]').forEach((input) => {
      answers.texts[input.name.slice('text-'.length)] = input.value;
    });
    setFormDisabled(form, true);
    vscode.postMessage({ type: 'submitRegression', answers });
  }

  function setFormDisabled(form, disabled) {
    form.querySelectorAll('input, textarea, button').forEach((control) => {
      control.disabled = disabled;
    });
  }

  function renderGradeLoading() {
    const grade = app.querySelector('.grade');
    if (!grade) {
      return;
    }
    grade.hidden = false;
    grade.innerHTML = `<p class="muted">${t('regression.gradeLoading')}</p>`;
  }

  function renderGrade(result) {
    const grade = app.querySelector('.grade');
    if (!grade) {
      return;
    }
    result.items.forEach((item) => {
      const feedback = app.querySelector(`[data-question-id="${CSS.escape(item.id)}"] .item-feedback`);
      if (feedback) {
        feedback.hidden = false;
        feedback.className = `item-feedback ${item.pass ? 'ok' : 'bad'}`;
        feedback.innerHTML = `<strong>${item.pass ? t('regression.pass') : t('common.needsImprovement')}</strong> ${escapeHtml(item.feedback)}`;
      }
    });
    grade.hidden = false;
    grade.innerHTML = `
      <h2>${t('regression.gradeResult')}</h2>
      <p class="grade-summary">${escapeHtml(result.score.percent)}% (${escapeHtml(result.score.correct)}/${escapeHtml(result.score.total)})</p>
      <button type="button" class="retry">${t('regression.retry')}</button>`;
    grade.querySelector('.retry').addEventListener('click', () => {
      const form = app.querySelector('.regression-form');
      if (form) {
        setFormDisabled(form, false);
      }
      grade.hidden = true;
      grade.innerHTML = '';
    });
    grade.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function renderGradeError(message) {
    const grade = app.querySelector('.grade');
    const form = app.querySelector('.regression-form');
    if (!grade || !form) {
      return;
    }
    setFormDisabled(form, false);
    grade.hidden = false;
    grade.innerHTML = `<p class="item-feedback bad" role="alert">${escapeHtml(message)}</p>`;
  }

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'paperReady') {
      renderPaper(message.paper);
    } else if (message.type === 'gradeLoading') {
      renderGradeLoading();
    } else if (message.type === 'gradeReady') {
      renderGrade(message.result);
    } else if (message.type === 'gradeError') {
      renderGradeError(message.message);
    }
  });

  vscode.postMessage({ type: 'ready' });
})();
