import { es, type TranslationKey } from './es';

// Helper i18n casero. ES-only por ahora. EN se añade en una fase posterior
// sustituyendo la tabla por un switch de locale.
export function t(key: TranslationKey): string {
  return es[key];
}
