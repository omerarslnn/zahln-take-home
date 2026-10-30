import { LOCALES } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';

/** DE/EN switch exposed to screen readers as a radio group; each label is in its own language. */
export function LanguageSwitch() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div role="radiogroup" aria-label={t('language.label')} className="flex gap-2">
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
            className={`min-h-touch min-w-touch rounded-control border-2 px-4 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
              selected ? 'border-brand bg-brand text-brand-on' : 'border-line bg-surface text-ink'
            }`}
          >
            {t(option === 'de' ? 'language.de' : 'language.en')}
          </button>
        );
      })}
    </div>
  );
}
