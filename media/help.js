(() => {
  const i18n = window.__codeExplainI18n;
  const articles = [...document.querySelectorAll('[data-locale]')];
  const localeButtons = [...document.querySelectorAll('[data-set-locale]')];

  function setLocale(locale) {
    const messages = i18n.messages[locale] || i18n.messages.en;
    document.documentElement.lang = locale;
    document.querySelectorAll('[data-i18n]').forEach((element) => {
      const key = element.dataset.i18n;
      element.textContent = messages[key] || key;
    });
    articles.forEach((article) => {
      article.hidden = article.dataset.locale !== locale;
    });
    localeButtons.forEach((button) => {
      const active = button.dataset.setLocale === locale;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  localeButtons.forEach((button) => {
    button.addEventListener('click', () => setLocale(button.dataset.setLocale));
  });

  setLocale(i18n.locale);
})();
