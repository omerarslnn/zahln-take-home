import { formatBerlinDateTime, formatCents } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Badge, Tone } from '../finance/text';

// Building blocks of the finance screens, on the shared design tokens. Every status has a glyph
// and words, never colour alone; controls are at least 48 px high and show a visible focus ring.

export const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand';

const TONE: Record<Tone, { glyph: string; text: string; border: string }> = {
  ok: { glyph: '✓', text: 'text-success', border: 'border-success' },
  pending: { glyph: '◔', text: 'text-brand', border: 'border-brand' },
  warning: { glyph: '!', text: 'text-warning', border: 'border-warning' },
  error: { glyph: '✕', text: 'text-danger', border: 'border-danger' },
  neutral: { glyph: '•', text: 'text-ink-muted', border: 'border-line' },
};

type ButtonTone = 'primary' | 'secondary';

export function Button({
  tone = 'primary',
  busy = false,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone; busy?: boolean }) {
  const look =
    tone === 'primary'
      ? 'border-brand bg-brand text-brand-on'
      : 'border-brand bg-surface text-brand';
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || busy}
      aria-busy={busy || undefined}
      className={`min-h-touch rounded-control border-2 px-4 font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${look} ${FOCUS} ${className}`}
    >
      {children}
    </button>
  );
}

export const linkClass = `font-semibold text-brand underline underline-offset-2 ${FOCUS}`;

export function StatusBadge({ badge }: { badge: Badge }) {
  const { t } = useI18n();
  const tone = TONE[badge.tone];
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-control border px-2 py-0.5 text-sm font-semibold ${tone.border} ${tone.text}`}
    >
      <span aria-hidden="true">{tone.glyph}</span>
      {t(badge.key)}
    </span>
  );
}

/** A message box. `alert` for failures the user should hear at once; others are polite. */
export function Notice({
  tone,
  title,
  children,
  role = 'status',
}: {
  tone: Tone;
  title: string;
  children?: ReactNode;
  role?: 'status' | 'alert' | 'none';
}) {
  const look = TONE[tone];
  return (
    <div
      role={role === 'none' ? undefined : role}
      className={`rounded-card border-l-4 bg-surface p-4 shadow-sm ${look.border}`}
    >
      <p className="font-semibold">
        <span aria-hidden="true" className={look.text}>
          {look.glyph}{' '}
        </span>
        {title}
      </p>
      {children ? <div className="mt-2 space-y-2">{children}</div> : null}
    </div>
  );
}

/** Integer cents as euros in the current language; negative amounts keep their minus sign. */
export function Money({ cents, strong = false }: { cents: number; strong?: boolean }) {
  const { locale } = useI18n();
  return (
    <span className={`whitespace-nowrap tabular-nums ${strong ? 'font-semibold' : ''}`}>
      {formatCents(cents, locale)}
    </span>
  );
}

/** A server timestamp in Berlin time, with the machine-readable instant for assistive tools. */
export function BerlinTime({ value }: { value: string | Date }) {
  const { locale } = useI18n();
  const instant = typeof value === 'string' ? value : value.toISOString();
  return (
    <time dateTime={instant} className="whitespace-nowrap tabular-nums">
      {formatBerlinDateTime(value, locale)}
    </time>
  );
}

export function Section({
  title,
  actions,
  children,
  id,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section aria-labelledby={id} className="space-y-3 rounded-card bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * A wide table that scrolls sideways on narrow screens. The region is focusable and named, so a
 * keyboard user can scroll it and a screen reader announces what it holds.
 */
export function TableScroll({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={`overflow-x-auto rounded-control ${FOCUS}`}
    >
      {children}
    </div>
  );
}

export const th = 'border-b-2 border-line px-3 py-2 text-left text-sm font-semibold text-ink-muted';
export const thNumber = `${th} text-right`;
export const td = 'border-b border-line/30 px-3 py-2 align-top';
export const tdNumber = `${td} text-right`;
