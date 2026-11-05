import { LOCALES } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import { FOCUS } from './ui';

/** DE/EN switch exposed to screen readers as a radio group; each label is in its own language. */
export function LanguageSwitch() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div
      role="radiogroup"
      aria-label={t('language.label')}
      className="inline-flex rounded-control border-2 border-line bg-surface p-0.5"
    >
      {LOCALES.map((option) => {
        const selected = option === locale;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            lang={option}
            onClick={() => setLocale(option)}
            className={`min-h-touch min-w-touch rounded-[8px] px-3 text-caption font-semibold transition-colors motion-reduce:transition-none ${FOCUS} ${
              selected ? 'bg-brand text-brand-on' : 'text-ink hover:bg-canvas'
            }`}
          >
            {t(option === 'de' ? 'language.de' : 'language.en')}
          </button>
        );
      })}
    </div>
  );
}
