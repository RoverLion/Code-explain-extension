import en from './messages.en.json';
import zhCn from './messages.zh-cn.json';

export type UiLocale = 'en' | 'zh-cn';

const catalogs: Record<UiLocale, Record<string, string>> = {
  en: en as Record<string, string>,
  'zh-cn': zhCn as Record<string, string>,
};

function getVscodeLanguage(): string {
  try {
    // Lazy load so i18n helpers stay testable outside the extension host.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('vscode') as typeof import('vscode')).env.language;
  } catch {
    return '';
  }
}

export function resolveUiLocale(language?: string): UiLocale {
  const lang = (language ?? getVscodeLanguage()).toLowerCase();
  return lang.startsWith('zh') ? 'zh-cn' : 'en';
}

export function getMessages(locale?: UiLocale): Record<string, string> {
  return { ...catalogs[locale ?? resolveUiLocale()] };
}

export function t(
  key: string,
  params?: Record<string, string | number>,
  locale?: UiLocale,
): string {
  const table = getMessages(locale);
  let text = table[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}
