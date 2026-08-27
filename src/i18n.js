/**
 * Minimal i18n: a locale is just a plain nested object of strings, looked
 * up by dotted key with {placeholder} substitution. No framework, no
 * pluralization rules — this app's strings are all short and singular, so
 * that complexity isn't worth adding. To add a language, copy
 * locales/en.js, translate every value (never the keys), and register it
 * in LOCALES below.
 */
const en = require('../locales/en');
const zhTW = require('../locales/zh-TW');

const LOCALES = { en, 'zh-TW': zhTW };
const DEFAULT_LOCALE = 'en';

function availableLocales() {
  return Object.keys(LOCALES).map((code) => ({ code, name: LOCALES[code].meta.name }));
}

// Windows' own locale (via Node/ICU) is the best free signal for what
// language to default to before the user has chosen anything explicitly.
function detectSystemLocale() {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || '';
    if (/^zh-(TW|HK|Hant)/i.test(locale)) return 'zh-TW';
    if (/^zh/i.test(locale)) return 'zh-TW'; // no zh-CN table yet — closer than falling back to English
  } catch {
    /* Intl should always exist in modern Node, but don't let this crash startup */
  }
  return DEFAULT_LOCALE;
}

let currentLocale = DEFAULT_LOCALE;

function setLocale(code) {
  currentLocale = LOCALES[code] ? code : DEFAULT_LOCALE;
}

function getLocale() {
  return currentLocale;
}

function lookup(table, dottedKey) {
  return dottedKey.split('.').reduce((node, part) => (node == null ? undefined : node[part]), table);
}

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

function resolveLocale(code) {
  return LOCALES[code] ? code : DEFAULT_LOCALE;
}

/** Returns undefined (not a placeholder string) when the key truly has no value in either locale — for keys that legitimately don't exist for every case, e.g. a per-status hint some statuses don't have. */
function tMaybe(dottedKey, vars) {
  const value = lookup(LOCALES[currentLocale], dottedKey) ?? lookup(LOCALES[DEFAULT_LOCALE], dottedKey);
  return value == null ? undefined : interpolate(value, vars);
}

/** t('tray.menu_quit') or t('result.claimed', { dayLabel: 'Day 26' }) */
function t(dottedKey, vars) {
  return tMaybe(dottedKey, vars) ?? dottedKey; // visible-but-harmless fallback for a missing/typo'd key
}

/**
 * Same as t(), but looks up in a specific locale without touching the
 * global currentLocale. For the Settings page, which needs to preview a
 * language before the user saves it — without that preview leaking into
 * what language the tray/notifications use for the rest of this same
 * resident process.
 */
function tFor(code, dottedKey, vars) {
  const locale = resolveLocale(code);
  const value = lookup(LOCALES[locale], dottedKey) ?? lookup(LOCALES[DEFAULT_LOCALE], dottedKey);
  return value == null ? dottedKey : interpolate(value, vars);
}

/** Turns a core.js result ({status, params}) into the current locale's message string. */
function formatResult(result) {
  return t(`result.${result.status}`, result.params);
}

module.exports = { t, tMaybe, tFor, formatResult, setLocale, getLocale, detectSystemLocale, availableLocales };
