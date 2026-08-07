(() => {
  const vscode = acquireVsCodeApi();
  const summary = document.getElementById('progress-summary');
  const chart = document.getElementById('knowledge-chart');
  const sessions = document.getElementById('recent-sessions');
  const bankList = document.getElementById('bank-list');
  const bankCount = document.getElementById('bank-count');
  const emptyState = document.getElementById('empty-state');
  const filterEmptyState = document.getElementById('filter-empty-state');
  const dataContent = document.getElementById('data-content');
  const progressContent = document.getElementById('progress-content');
  const bankContent = document.getElementById('bank-content');
  const clearButton = document.getElementById('clear-progress');
  const languageFilter = document.getElementById('language-filter');
  const tagFilter = document.getElementById('tag-filter');
  const keywordFilter = document.getElementById('keyword-filter');
  const tabButtons = [...document.querySelectorAll('[data-tab]')];

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

  function dateLocaleBcp47() {
    const locale = (window.__codeExplainI18n && window.__codeExplainI18n.locale) || 'en';
    return locale === 'zh-cn' ? 'zh-CN' : 'en-US';
  }

  let currentProgress = { version: 2, sessions: [], knowledgeStats: {} };
  let currentBank = { version: 1, questions: [] };
  let activeTab = 'progress';

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalize(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function accuracy(stat) {
    const total = stat.correct + stat.wrong;
    return total ? stat.correct / total : 0;
  }

  function filters() {
    return {
      languageId: languageFilter.value,
      tag: tagFilter.value,
      query: keywordFilter.value,
    };
  }

  function matches(languageId, tags, searchable, selected) {
    const language = normalize(selected.languageId);
    const tag = normalize(selected.tag);
    const query = normalize(selected.query);
    return (!language || normalize(languageId) === language)
      && (!tag || (tags || []).some((value) => normalize(value) === tag))
      && (!query || searchable.some((value) => normalize(value).includes(query)));
  }

  function filterKnowledge(progress, selected) {
    return Object.values(progress.knowledgeStats)
      .filter((stat) => matches(
        stat.languageId,
        stat.tags,
        [stat.title, stat.languageId, ...(stat.tags || [])],
        selected,
      ))
      .sort((left, right) => accuracy(left) - accuracy(right)
        || left.title.localeCompare(right.title, dateLocaleBcp47()));
  }

  function filterSessions(progress, selected) {
    return progress.sessions.filter((session) => {
      const tags = session.knowledge.flatMap((item) => item.tags || []);
      return matches(
        session.languageId,
        tags,
        [
          session.title,
          session.summary,
          session.filePath,
          session.languageId,
          ...session.knowledge.map((item) => item.title),
          ...tags,
        ],
        selected,
      );
    });
  }

  function filterQuestions(bank, selected) {
    return bank.questions
      .filter((question) => matches(
        question.languageId,
        question.tags,
        [
          question.stem,
          question.languageId,
          ...question.knowledgeTitles,
          ...(question.tags || []),
        ],
        selected,
      ))
      .sort((left, right) => Number(right.starred) - Number(left.starred)
        || right.updatedAt.localeCompare(left.updatedAt));
  }

  function collectFilterOptions(progress, bank, languageId) {
    const languages = new Set();
    const tags = new Set();
    const selectedLanguage = normalize(languageId);
    Object.values(progress.knowledgeStats).forEach((stat) => {
      languages.add(stat.languageId);
      if (selectedLanguage && normalize(stat.languageId) === selectedLanguage) {
        (stat.tags || []).forEach((tag) => tags.add(tag));
      }
    });
    progress.sessions.forEach((session) => {
      languages.add(session.languageId);
      if (selectedLanguage && normalize(session.languageId) === selectedLanguage) {
        session.knowledge.forEach((item) => (item.tags || []).forEach((tag) => tags.add(tag)));
      }
    });
    bank.questions.forEach((question) => {
      languages.add(question.languageId);
      if (selectedLanguage && normalize(question.languageId) === selectedLanguage) {
        (question.tags || []).forEach((tag) => tags.add(tag));
      }
    });
    return {
      languages: [...languages].sort(),
      tags: [...tags].sort((left, right) => left.localeCompare(right, dateLocaleBcp47())),
    };
  }

  function updateFilterOptions(progress, bank) {
    const previousLanguage = languageFilter.value;
    const previousTag = tagFilter.value;
    const { languages } = collectFilterOptions(progress, bank, '');
    languageFilter.innerHTML = `<option value="">${t('progress.allLanguages')}</option>`
      + languages.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
    const selectedLanguage = languages.includes(previousLanguage) ? previousLanguage : '';
    languageFilter.value = selectedLanguage;

    const { tags } = collectFilterOptions(progress, bank, selectedLanguage);
    const languageSelected = Boolean(selectedLanguage);
    tagFilter.disabled = !languageSelected;
    tagFilter.innerHTML = languageSelected
      ? `<option value="">${t('progress.allTags')}</option>`
        + tags.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')
      : `<option value="">${t('progress.tagFilterSelectLanguage')}</option>`;
    tagFilter.value = languageSelected && tags.includes(previousTag) ? previousTag : '';
  }

  function renderSummary(filteredSessions) {
    const totals = filteredSessions.reduce(
      (result, session) => ({
        correct: result.correct + session.score.correct,
        total: result.total + session.score.total,
      }),
      { correct: 0, total: 0 },
    );
    const percent = totals.total ? Math.round((totals.correct / totals.total) * 100) : 0;
    summary.innerHTML = `
      <article class="summary-card">
        <span class="summary-value">${filteredSessions.length}</span>
        <span class="summary-label">${t('progress.sessions')}</span>
      </article>
      <article class="summary-card">
        <span class="summary-value">${percent}%</span>
        <span class="summary-label">${t('progress.totalAccuracy', totals)}</span>
      </article>`;
  }

  function renderKnowledge(stats) {
    chart.innerHTML = stats.length
      ? stats.map((stat) => {
          const percent = Math.round(accuracy(stat) * 100);
          return `
            <article class="knowledge-row">
              <div class="knowledge-meta">
                <strong>${escapeHtml(stat.title)}</strong>
                <span>${escapeHtml(t('progress.correctWrong', {
                  language: stat.languageId,
                  percent,
                  correct: stat.correct,
                  wrong: stat.wrong,
                }))}</span>
              </div>
              <progress class="bar-track" aria-label="${escapeHtml(stat.title)}" max="100" value="${percent}">${percent}%</progress>
            </article>`;
        }).join('')
      : `<p class="muted">${t('progress.noKnowledgeStats')}</p>`;
  }

  function renderQuizGroup(title, items, className) {
    return `
      <section class="quiz-group ${className}">
        <h4>${title}</h4>
        ${items.length
          ? items.map((item) => `
              <article class="quiz-item">
                <strong>${escapeHtml(item.stem || t('progress.questionFallback', { id: item.id }))}</strong>
                <p>${escapeHtml(item.feedback)}</p>
              </article>`).join('')
          : `<p class="muted">${t('progress.none')}</p>`}
      </section>`;
  }

  function renderSessions(filteredSessions) {
    const recent = filteredSessions.slice(-10).reverse();
    sessions.innerHTML = recent.length
      ? recent.map((session) => {
          const passed = session.quizItems.filter((item) => item.pass);
          const failed = session.quizItems.filter((item) => !item.pass);
          const timestamp = new Date(session.at);
          const dateLabel = Number.isNaN(timestamp.getTime())
            ? session.at
            : timestamp.toLocaleString(dateLocaleBcp47());
          return `
            <details class="session-card">
              <summary>
                <span>
                  <strong>${escapeHtml(session.title)}</strong>
                  <small>${escapeHtml(dateLabel)} · ${escapeHtml(session.languageId)}</small>
                </span>
                <span class="session-score">${session.score.percent}%</span>
              </summary>
              <p class="session-description">${escapeHtml(session.summary)}</p>
              <div class="quiz-groups">
                ${renderQuizGroup(t('progress.correctItems', { count: passed.length }), passed, 'pass')}
                ${renderQuizGroup(t('progress.needsImprovementItems', { count: failed.length }), failed, 'fail')}
              </div>
            </details>`;
        }).join('')
      : `<p class="muted">${t('progress.noSessions')}</p>`;
  }

  function renderBank(questions) {
    bankCount.textContent = t('progress.questionCount', { count: questions.length });
    bankList.innerHTML = questions.length
      ? questions.map((question) => {
          const result = question.lastResult
            ? `<span class="result ${question.lastResult.pass ? 'pass' : 'fail'}">${question.lastResult.pass ? t('progress.lastCorrect') : t('progress.lastIncorrect')}</span>`
            : `<span class="muted">${t('progress.noResult')}</span>`;
          return `
            <article class="bank-card">
              <div class="bank-card-header">
                <div class="bank-meta">
                  <span>${escapeHtml(question.languageId)}</span>
                  <span>${question.type === 'choice' ? t('progress.choiceQuestion') : t('progress.shortQuestion')}</span>
                  ${result}
                </div>
                <button class="star-button ${question.starred ? 'is-starred' : ''}" type="button"
                  data-question-id="${escapeHtml(question.id)}" data-starred="${question.starred}"
                  aria-label="${question.starred ? t('progress.unstarQuestion') : t('progress.starQuestion')}"
                  title="${question.starred ? t('progress.unstarQuestion') : t('progress.starQuestion')}">${question.starred ? '★' : '☆'}</button>
              </div>
              <h3>${escapeHtml(question.stem)}</h3>
              <p class="bank-knowledge">${question.knowledgeTitles.map(escapeHtml).join(' · ') || t('progress.uncategorized')}</p>
              ${(question.tags || []).length
                ? `<div class="tag-list">${question.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>`
                : ''}
            </article>`;
        }).join('')
      : `<p class="muted">${t('progress.noQuestions')}</p>`;
  }

  function setActiveTab(tab) {
    activeTab = tab === 'bank' ? 'bank' : 'progress';
    progressContent.hidden = activeTab !== 'progress';
    bankContent.hidden = activeTab !== 'bank';
    clearButton.hidden = activeTab !== 'progress' || currentProgress.sessions.length === 0;
    tabButtons.forEach((button) => {
      const active = button.dataset.tab === activeTab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    renderFiltered();
  }

  function renderFiltered() {
    const selected = filters();
    const stats = filterKnowledge(currentProgress, selected);
    const filteredSessions = filterSessions(currentProgress, selected);
    const questions = filterQuestions(currentBank, selected);
    const hasFilter = Boolean(selected.languageId || selected.tag || normalize(selected.query));
    const baseCount = activeTab === 'progress'
      ? Object.keys(currentProgress.knowledgeStats).length + currentProgress.sessions.length
      : currentBank.questions.length;
    const filteredCount = activeTab === 'progress'
      ? stats.length + filteredSessions.length
      : questions.length;
    filterEmptyState.hidden = !(hasFilter && baseCount > 0 && filteredCount === 0);
    if (activeTab === 'progress') {
      renderSummary(filteredSessions);
      renderKnowledge(stats);
      renderSessions(filteredSessions);
    } else {
      renderBank(questions);
    }
  }

  function render(progress, bank, requestedTab) {
    currentProgress = progress;
    currentBank = bank;
    const hasData = progress.sessions.length > 0
      || Object.keys(progress.knowledgeStats).length > 0
      || bank.questions.length > 0;
    emptyState.hidden = hasData;
    dataContent.hidden = !hasData;
    clearButton.disabled = false;
    if (!hasData) {
      clearButton.hidden = true;
      return;
    }
    updateFilterOptions(progress, bank);
    setActiveTab(requestedTab || activeTab);
  }

  languageFilter.addEventListener('change', () => {
    updateFilterOptions(currentProgress, currentBank);
    renderFiltered();
  });
  tagFilter.addEventListener('change', renderFiltered);
  keywordFilter.addEventListener('input', renderFiltered);
  tabButtons.forEach((button) => {
    button.addEventListener('click', () => setActiveTab(button.dataset.tab));
  });
  clearButton.addEventListener('click', () => {
    clearButton.disabled = true;
    vscode.postMessage({ type: 'clearProgress' });
  });
  bankList.addEventListener('click', (event) => {
    const button = event.target.closest('.star-button');
    if (!button) {
      return;
    }
    button.disabled = true;
    vscode.postMessage({
      type: 'starToggle',
      questionId: button.dataset.questionId,
      starred: button.dataset.starred !== 'true',
    });
  });

  window.addEventListener('message', (event) => {
    if (event.data?.type === 'progressReady') {
      render(event.data.progress, event.data.bank, event.data.activeTab);
    }
  });

  vscode.postMessage({ type: 'ready' });
})();
