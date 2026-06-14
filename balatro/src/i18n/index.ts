import { en } from './en';
import { ja } from './ja';
import type { DeepPartial, Translations } from './types';

export type { Translations, JokerText, DeepPartial } from './types';

export type Locale = 'en' | 'ja';

/** English is always the fallback; other locales supply partial overrides. */
const OVERRIDES: Record<Locale, DeepPartial<Translations>> = { en: {}, ja };

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

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * Overlay `override` onto `base` string by string: a defined override leaf
 * wins, an omitted one keeps the base. Nested tables merge recursively;
 * functions (and any other non-object leaf) are taken whole.
 */
function mergeValue(base: unknown, override: unknown): unknown {
  if (override === undefined) return base;
  if (isObject(base) && isObject(override)) {
    const result: Record<string, unknown> = { ...base };
    for (const key of Object.keys(override)) {
      result[key] = mergeValue(base[key], override[key]);
    }
    return result;
  }
  return override;
}

/** A complete table built from English plus whatever the locale overrides. */
export function buildTranslations(override: DeepPartial<Translations>): Translations {
  return mergeValue(en, override) as Translations;
}

export const locale: Locale = detectLocale();

/**
 * The active translation table, chosen once from the browser language. Any
 * string the locale leaves out falls back to its English counterpart.
 */
export const t: Translations = buildTranslations(OVERRIDES[locale]);
