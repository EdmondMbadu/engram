export interface SupportedLocale {
  readonly id: 'en-US' | 'fr' | 'ja';
  readonly language: 'en' | 'fr' | 'ja';
  readonly subPath: '' | 'fr' | 'ja';
  readonly label: string;
  readonly direction: 'ltr';
}

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = [
  { id: 'en-US', language: 'en', subPath: '', label: 'English', direction: 'ltr' },
  { id: 'fr', language: 'fr', subPath: 'fr', label: 'Français', direction: 'ltr' },
  { id: 'ja', language: 'ja', subPath: 'ja', label: '日本語', direction: 'ltr' },
];

export const DEFAULT_LOCALE = SUPPORTED_LOCALES[0];
export const LOCALE_STORAGE_KEY = 'livingwiki.locale';

export function supportedLocale(localeId: string | null | undefined): SupportedLocale {
  const normalized = (localeId ?? '').toLowerCase();
  return SUPPORTED_LOCALES.find(
    (locale) => locale.id.toLowerCase() === normalized || locale.language === normalized,
  ) ?? DEFAULT_LOCALE;
}

export function localizedPath(pathname: string, target: SupportedLocale): string {
  let localeNeutralPath = pathname.startsWith('/') ? pathname : `/${pathname}`;

  for (const locale of SUPPORTED_LOCALES) {
    if (!locale.subPath) continue;
    const prefix = `/${locale.subPath}`;
    if (localeNeutralPath === prefix) {
      localeNeutralPath = '/';
      break;
    }
    if (localeNeutralPath.startsWith(`${prefix}/`)) {
      localeNeutralPath = localeNeutralPath.slice(prefix.length) || '/';
      break;
    }
  }

  if (!target.subPath) return localeNeutralPath;
  return localeNeutralPath === '/'
    ? `/${target.subPath}/`
    : `/${target.subPath}${localeNeutralPath}`;
}
