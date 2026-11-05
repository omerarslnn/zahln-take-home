import { formatBerlinDateTime, formatCents } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import { createContext, useContext, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Badge, Tone } from '../finance/text';
import { Icon, type IconName } from './Icon';

// Building blocks of the finance screens, on the shared design tokens and the colour pairings the
// native apps use (contrast-tested in @mensa/shared). Every status has a glyph and words, never
// colour alone; controls are at least 48 px high and show a visible focus ring.

export const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand';

const TONE: Record<Tone, { glyph: string; text: string; surface: string; border: string }> = {
  ok: {
    glyph: '✓',
    text: 'text-success-strong',
    surface: 'bg-success-subtle',
    border: 'border-success-line',
  },
  pending: {
    glyph: '◔',
    text: 'text-brand-strong',
    surface: 'bg-brand-subtle',
    border: 'border-brand-line',
  },
  warning: {
    glyph: '!',
    text: 'text-warning-strong',
    surface: 'bg-warning-subtle',
    border: 'border-warning-line',
  },
  error: {
    glyph: '✕',
    text: 'text-danger-strong',
    surface: 'bg-danger-subtle',
    border: 'border-danger-line',
  },
  neutral: {
    glyph: '•',
    text: 'text-ink-muted',
    surface: 'bg-canvas',
    border: 'border-line-subtle',
  },
};

type ButtonTone = 'primary' | 'secondary' | 'tertiary';

const BUTTON: Record<ButtonTone, string> = {
  primary: 'border-brand bg-brand text-brand-on hover:border-brand-strong hover:bg-brand-strong',
  secondary: 'border-brand bg-surface text-brand hover:bg-brand-subtle',
  tertiary: 'border-transparent bg-transparent text-brand hover:bg-brand-subtle',
};

export function Button({
  tone = 'primary',
  busy = false,
  icon,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: ButtonTone;
  busy?: boolean;
  icon?: IconName;
}) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex min-h-touch items-center justify-center gap-2 rounded-control border-2 px-4 font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60 ${BUTTON[tone]} ${FOCUS} ${className}`}
    >
      {busy ? <Spinner /> : icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  );
}

/** A link styled as a button, for navigation that looks like an action (previous day, …). */
export function ButtonLink({
  href,
  tone = 'secondary',
  icon,
  children,
}: {
  href: string;
  tone?: ButtonTone;
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className={`inline-flex min-h-touch items-center justify-center gap-2 rounded-control border-2 px-4 font-semibold transition-colors motion-reduce:transition-none ${BUTTON[tone]} ${FOCUS}`}
    >
      {icon ? <Icon name={icon} /> : null}
      {children}
    </a>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
    />
  );
}

export const linkClass = `font-semibold text-brand underline underline-offset-2 hover:text-brand-strong ${FOCUS}`;

export function StatusBadge({ badge }: { badge: Badge }) {
  const { t } = useI18n();
  const tone = TONE[badge.tone];
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-caption font-semibold ${tone.surface} ${tone.border} ${tone.text}`}
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
      className={`flex gap-3 rounded-card border p-4 ${look.surface} ${look.border}`}
    >
      <span
        aria-hidden="true"
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface font-bold ${look.text}`}
      >
        {look.glyph}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">{title}</p>
        {children ? <div className="mt-2 space-y-2 text-ink">{children}</div> : null}
      </div>
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

export const cardClass = 'rounded-card border border-line-subtle bg-surface shadow-sm';

/** A card with a heading, an optional description and actions on the right. */
export function Section({
  title,
  description,
  actions,
  children,
  id,
  flush = false,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
  /** No inner padding below the header: for tables that run to the card's edges. */
  flush?: boolean;
}) {
  return (
    <section aria-labelledby={id} className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-3 pt-5">
        <div className="min-w-0 space-y-1">
          <h2 id={id} className="text-headline font-semibold text-ink">
            {title}
          </h2>
          {description ? <div className="text-caption text-ink-muted">{description}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div className={flush ? 'pb-2' : 'space-y-3 px-5 pb-5'}>{children}</div>
    </section>
  );
}

/** A key figure: a label, the amount large and tabular, and one line of context. */
export function StatCard({
  label,
  icon,
  value,
  detail,
  tag,
}: {
  label: string;
  icon: IconName;
  value: ReactNode;
  detail: string;
  /** A word next to the label for a notable state (e.g. a negative net), never colour alone. */
  tag?: Badge;
}) {
  return (
    <div className={`${cardClass} flex flex-col gap-2 p-5`}>
      <dt className="flex flex-wrap items-center gap-2 text-caption font-semibold text-ink-muted">
        <span className="flex h-8 w-8 items-center justify-center rounded-control bg-brand-subtle text-brand">
          <Icon name={icon} />
        </span>
        {label}
        {tag ? <StatusBadge badge={tag} /> : null}
      </dt>
      <dd data-amount className="text-title font-bold text-ink">
        {value}
      </dd>
      <dd className="text-caption text-ink-muted">{detail}</dd>
    </div>
  );
}

/** Placeholder blocks in the shape of what is loading; hidden from screen readers. */
export function Skeleton({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-control bg-fill motion-reduce:animate-none ${className}`}
    />
  );
}

/**
 * A wide table that scrolls sideways on narrow screens. The region is focusable and named, so a
 * keyboard user can scroll it and a screen reader announces what it holds.
 */
export function TableScroll({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className={`overflow-x-auto ${FOCUS}`}>
      {children}
    </div>
  );
}

export const th =
  'border-b border-line-subtle bg-canvas px-4 py-3 text-left text-caption font-semibold uppercase tracking-wide text-ink-muted';
export const thNumber = `${th} text-right`;
export const td = 'border-b border-line-subtle px-4 py-3 align-top';
export const tdNumber = `${td} text-right tabular-nums`;
/** Rows that lead somewhere get a hover tint (the link inside stays the focus target). */
export const rowHover = 'transition-colors hover:bg-brand-subtle/50 motion-reduce:transition-none';

// ---- page actions ---------------------------------------------------------------------------------

/** Where a page's actions appear: next to its heading in the layout. */
export const PageActionsTarget = createContext<HTMLElement | null>(null);

/**
 * Renders a page's primary actions (Export CSV, Refresh) next to the page heading, so they are the
 * first thing after the title in reading and Tab order, while the page keeps owning their state.
 */
export function PageActions({ children }: { children: ReactNode }) {
  const target = useContext(PageActionsTarget);
  return target ? createPortal(children, target) : null;
}
