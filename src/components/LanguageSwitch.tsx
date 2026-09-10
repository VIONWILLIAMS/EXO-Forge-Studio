import { setLocale, tr, useLocale } from '../i18n';

export function LanguageSwitch() {
  const locale = useLocale();
  return <div className="language-switch" role="group" aria-label={tr('语言')} data-testid="language-switch">
    <button type="button" lang="zh-CN" data-testid="language-zh" aria-label={tr('切换为中文')} aria-pressed={locale === 'zh'} onClick={() => setLocale('zh')}>中文</button>
    <button type="button" lang="en" data-testid="language-en" aria-label={tr('切换为英文')} aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>EN</button>
  </div>;
}
