import { en } from './en';
import { ja } from './ja';
import type { Translations } from './types';

export type { Translations, JokerText } from './types';

export type Locale = 'en' | 'ja';

const DICTIONARIES: Record<Locale, Translations> = { en, ja };

/**
 * Pick the locale from the browser's language list, falling back to English
 * for anything we don't ship. The list is in preference order, so the first
 * language we actually support wins. Only the primary subtag matters
 * (ja-JP → ja).
 */
export function detectLocale(
  languages: readonly string[] = navigator.languages ?? [navigator.language],
): Locale {
  for (const lang of languages) {
    const primary = lang?.toLowerCase().split('-')[0];
    if (primary === 'ja') return 'ja';
    if (primary === 'en') return 'en';
  }
  return 'en';
}

export const locale: Locale = detectLocale();

/** The active translation table, chosen once from the browser language. */
export const t: Translations = DICTIONARIES[locale];
