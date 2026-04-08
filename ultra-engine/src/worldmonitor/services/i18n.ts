// ════════════════════════════════════════════════════════════
//  WM Phase 1 stub — i18n service
//
//  El i18n.ts original importa i18next + i18next-browser-languagedetector
//  + locales/en.json. Eso es frontend-only (browser localization). En el
//  backend del Pilar 1 no necesitamos i18n real — los servicios devuelven
//  raw data y la localización se hace en el cliente cuando exista.
//
//  Stub: t() devuelve la key passthrough (igual que cualquier i18n cuando
//  no hay traducción). El resto de funciones son no-ops compatibles con
//  el shape esperado por los callers.
//
//  Phase 2+ puede reemplazar con i18next real si se decide localizar
//  responses en backend. Por ahora innecesario.
// ════════════════════════════════════════════════════════════

export async function initI18n(): Promise<void> {
  // no-op
}

export function t(key: string, _options?: Record<string, unknown>): string {
  return key;
}

export async function changeLanguage(_lng: string): Promise<void> {
  // no-op
}

export function getCurrentLanguage(): string {
  return 'en';
}

export function isRTL(): boolean {
  return false;
}

export function getLocale(): string {
  return 'en-US';
}

export const LANGUAGES = [
  { code: 'en', name: 'English', native: 'English', rtl: false },
  { code: 'es', name: 'Spanish', native: 'Español', rtl: false },
  { code: 'fr', name: 'French', native: 'Français', rtl: false },
  { code: 'ar', name: 'Arabic', native: 'العربية', rtl: true },
];
