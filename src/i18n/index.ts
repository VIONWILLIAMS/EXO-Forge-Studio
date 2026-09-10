import { useSyncExternalStore } from 'react';
import en from './en.json';
import zh from './zh.json';

export type Locale = 'zh' | 'en';
export const LANGUAGE_KEY = 'exo-forge-language';
const listeners = new Set<() => void>();
function initialLocale(): Locale {
  if (typeof window === 'undefined') return 'zh';
  const query = new URLSearchParams(window.location.search).get('lang');
  try {
    if (query === 'en' || query === 'zh') {
      window.localStorage.setItem(LANGUAGE_KEY, query);
      return query;
    }
    return window.localStorage.getItem(LANGUAGE_KEY) === 'en' ? 'en' : 'zh';
  }
  catch { return query === 'en' ? 'en' : 'zh'; }
}
let locale = initialLocale();
export const getLocale = () => locale;
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const useLocale = () => useSyncExternalStore(subscribe, getLocale, () => 'zh' as Locale);

function updateDocument() {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  document.title = 'ATLAS R04 · EXO Forge Studio';
  document.querySelector('meta[name="description"]')?.setAttribute('content', locale === 'zh'
    ? 'ATLAS 人体外骨骼概念设计平台：装配检查、人体动作、双机械臂与连贯场景演示。'
    : 'ATLAS exoskeleton concept studio: assembly inspection, human motion, dual robot arms and task demonstrations.');
}
export function setLocale(next: Locale) {
  locale = next;
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(LANGUAGE_KEY, next); } catch { /* The switch still works when storage is unavailable. */ }
    const url = new URL(window.location.href);
    url.searchParams.set('lang', next);
    window.history.replaceState(window.history.state, '', url);
  }
  updateDocument();
  listeners.forEach(listener => listener());
}
updateDocument();

const dictionaries: Record<Locale, Record<string, string>> = { en, zh };
const templates = Object.entries(en).filter(([key]) => /\{\d+\}/.test(key)).map(([source, target]) => {
  const indices: number[] = [];
  const escaped = source.split(/(\{\d+\})/).map(part => {
    if (/^\{\d+\}$/.test(part)) { indices.push(Number(part.slice(1, -1))); return '(.*?)'; }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('');
  return { pattern: new RegExp(`^${escaped}$`, 'u'), target, indices };
});

/** Translate only presentation values. Canonical IDs, geometry and saved configs stay unchanged. */
export function translate(text: string, language: Locale = locale, values?: readonly unknown[]): string {
  const key = text.trim();
  let result = dictionaries[language][key];
  if (result === undefined && language === 'en' && /[\u3400-\u9fff]/u.test(key)) {
    for (const template of templates) {
      const match = key.match(template.pattern);
      if (!match) continue;
      result = template.target.replace(/\{(\d+)\}/g, (_, i: string) => translate(match[template.indices.indexOf(Number(i)) + 1] ?? '', language));
      break;
    }
  }
  result ??= key;
  if (values) result = result.replace(/\{(\d+)\}/g, (_, i: string) => translate(String(values[Number(i)] ?? ''), language));
  return text.slice(0, text.indexOf(key)) + result + text.slice(text.indexOf(key) + key.length);
}
export function tr(text: string, values: readonly unknown[]): string;
export function tr<T>(value: T): T;
export function tr(value: unknown, values?: readonly unknown[]): unknown {
  return typeof value === 'string' ? translate(value, locale, values) : value;
}
