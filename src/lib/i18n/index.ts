/**
 * Internationalisation.
 *
 * English and Kiswahili are both first-class from day one, because a platform
 * for Kenyan workers that only speaks English excludes a large part of its
 * users. The dictionary is typed against the English keys, so a missing
 * translation is a compile error rather than a blank label in production.
 *
 * Adding a market language means adding one dictionary file — no code changes.
 */
export const LOCALES = ['en', 'sw'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  sw: 'Kiswahili',
};

const en = {
  'nav.findWork': 'Find work',
  'nav.hireTalent': 'Hire talent',
  'nav.signIn': 'Sign in',
  'nav.signUp': 'Create account',
  'nav.dashboard': 'Dashboard',
  'nav.jobs': 'Jobs',
  'nav.tasks': 'Tasks',
  'nav.profile': 'Profile',
  'nav.earnings': 'Earnings',
  'nav.signOut': 'Sign out',

  'landing.headline': 'Turn Your Skills Into Income.',
  'landing.subheadline':
    'KaziOS helps you discover what you can do, prove your skills and connect with real work.',
  'landing.ctaPrimary': 'Find Work',
  'landing.ctaSecondary': 'Hire Talent',

  'readiness.title': 'Work readiness',
  'readiness.improve': 'Improve your score',
  'readiness.explain': 'How this is calculated',

  'evidence.SELF_REPORTED': 'Self-reported',
  'evidence.AI_INFERRED': 'AI-inferred',
  'evidence.SIMULATION_VERIFIED': 'Simulation verified',
  'evidence.EMPLOYER_VERIFIED': 'Employer verified',

  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.continue': 'Continue',
  'common.back': 'Back',
  'common.loading': 'Loading…',
  'common.retry': 'Try again',
  'common.apply': 'Apply',
  'common.viewAll': 'View all',

  'empty.noJobs': 'No jobs match you yet.',
  'empty.noTasks': 'No tasks match you yet.',
  'empty.unlock': 'Complete a work simulation to unlock more opportunities.',
} as const;

export type TranslationKey = keyof typeof en;

const sw: Record<TranslationKey, string> = {
  'nav.findWork': 'Tafuta kazi',
  'nav.hireTalent': 'Ajiri wafanyakazi',
  'nav.signIn': 'Ingia',
  'nav.signUp': 'Fungua akaunti',
  'nav.dashboard': 'Dashibodi',
  'nav.jobs': 'Kazi',
  'nav.tasks': 'Vibarua',
  'nav.profile': 'Wasifu',
  'nav.earnings': 'Mapato',
  'nav.signOut': 'Toka',

  'landing.headline': 'Geuza Ujuzi Wako Kuwa Kipato.',
  'landing.subheadline':
    'KaziOS inakusaidia kugundua unachoweza kufanya, kuthibitisha ujuzi wako na kuunganishwa na kazi halisi.',
  'landing.ctaPrimary': 'Tafuta Kazi',
  'landing.ctaSecondary': 'Ajiri Wafanyakazi',

  'readiness.title': 'Utayari wa kazi',
  'readiness.improve': 'Boresha alama yako',
  'readiness.explain': 'Jinsi alama hii inavyohesabiwa',

  'evidence.SELF_REPORTED': 'Umejitangaza',
  'evidence.AI_INFERRED': 'Imekadiriwa na AI',
  'evidence.SIMULATION_VERIFIED': 'Imethibitishwa kwa jaribio',
  'evidence.EMPLOYER_VERIFIED': 'Imethibitishwa na mwajiri',

  'common.save': 'Hifadhi',
  'common.cancel': 'Ghairi',
  'common.continue': 'Endelea',
  'common.back': 'Rudi',
  'common.loading': 'Inapakia…',
  'common.retry': 'Jaribu tena',
  'common.apply': 'Omba',
  'common.viewAll': 'Ona zote',

  'empty.noJobs': 'Hakuna kazi zinazokufaa bado.',
  'empty.noTasks': 'Hakuna vibarua vinavyokufaa bado.',
  'empty.unlock': 'Kamilisha jaribio la kazi ili kufungua nafasi zaidi.',
};

const DICTIONARIES: Record<Locale, Record<TranslationKey, string>> = { en, sw };

/** Look up a string, falling back to English then to the key itself. */
export function translate(locale: Locale, key: TranslationKey): string {
  return DICTIONARIES[locale]?.[key] ?? en[key] ?? key;
}

/** Bind a locale once and reuse. */
export function translator(locale: Locale) {
  return (key: TranslationKey) => translate(locale, key);
}

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/**
 * Format KES minor units for display.
 * Kenyan convention: "KES 45,000" — whole shillings unless cents are non-zero.
 */
export function formatKes(minor: number, options: { compact?: boolean } = {}): string {
  const major = minor / 100;
  if (options.compact && major >= 1_000_000) return `KES ${(major / 1_000_000).toFixed(1)}M`;
  if (options.compact && major >= 10_000) return `KES ${Math.round(major / 1000)}K`;
  const hasCents = minor % 100 !== 0;
  return `KES ${major.toLocaleString('en-KE', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  })}`;
}

/** Relative time in plain English, for feeds and lists. */
export function timeAgo(date: Date | string): string {
  const then = typeof date === 'string' ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - then.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  return `${Math.floor(months / 12)} year${Math.floor(months / 12) === 1 ? '' : 's'} ago`;
}
