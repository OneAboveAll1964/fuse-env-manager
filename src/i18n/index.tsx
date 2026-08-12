import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { en, type Dictionary } from '@/i18n/en';

export type LanguageCode = 'en';

export type LanguageDefinition = {
  code: LanguageCode;
  label: string;
  nativeLabel: string;
  direction: 'ltr' | 'rtl';
  dictionary: Dictionary;
};

export const LANGUAGES: LanguageDefinition[] = [
  { code: 'en', label: 'English', nativeLabel: 'English', direction: 'ltr', dictionary: en },
];

export const DEFAULT_LANGUAGE: LanguageCode = 'en';

type Path = string;

function lookup(dictionary: Dictionary, path: Path): string {
  const segments = path.split('.');
  let current: unknown = dictionary;
  for (const segment of segments) {
    if (current && typeof current === 'object' && segment in (current as object)) {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return path;
    }
  }
  return typeof current === 'string' ? current : path;
}

type I18nContextValue = {
  language: LanguageDefinition;
  languages: LanguageDefinition[];
  direction: 'ltr' | 'rtl';
  t: (path: Path, values?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function resolveLanguage(code: string): LanguageDefinition {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

export function I18nProvider({
  code,
  children,
}: {
  code: string;
  children: ReactNode;
}): JSX.Element {
  const language = useMemo(() => resolveLanguage(code), [code]);

  const t = useCallback(
    (path: Path, values?: Record<string, string | number>): string => {
      const template = lookup(language.dictionary, path);
      if (!values) return template;
      return template.replace(/\{(\w+)\}/g, (match, key: string) =>
        key in values ? String(values[key]) : match,
      );
    },
    [language],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ language, languages: LANGUAGES, direction: language.direction, t }),
    [language, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}

export function useT(): I18nContextValue['t'] {
  return useI18n().t;
}
