// The primitives' looks as data, so tests can check every pairing against WCAG without rendering.
// Class names are spelled out in full: Tailwind generates only the classes it finds in the source.
// Icon colours are token values, because icons take a colour prop, not a class.
import type Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '@mensa/shared';

export type IconName = keyof typeof Ionicons.glyphMap;

/**
 * What a status or message means: ok (done), pending (in progress), warning (needs attention),
 * error (failed or refused), neutral (information).
 */
export type Tone = 'ok' | 'pending' | 'warning' | 'error' | 'neutral';

export interface ToneStyle {
  /** A banner's tinted surface and its hairline. */
  surface: string;
  border: string;
  /** A status pill's surface: as the banner's, except neutral, which sits on white cards. */
  pill: string;
  /** Pill text on `pill`. */
  text: string;
  /** An icon that says what the colour says, so colour is never the only signal. */
  icon: IconName;
  iconColor: string;
}

export const TONE: Record<Tone, ToneStyle> = {
  ok: {
    surface: 'bg-success-subtle',
    border: 'border-success-line',
    pill: 'bg-success-subtle',
    text: 'text-success-strong',
    icon: 'checkmark-circle',
    iconColor: colors.successStrong,
  },
  pending: {
    surface: 'bg-brand-subtle',
    border: 'border-brand-line',
    pill: 'bg-brand-subtle',
    text: 'text-brand-strong',
    icon: 'time',
    iconColor: colors.brandStrong,
  },
  warning: {
    surface: 'bg-warning-subtle',
    border: 'border-warning-line',
    pill: 'bg-warning-subtle',
    text: 'text-warning-strong',
    icon: 'alert-circle',
    iconColor: colors.warningStrong,
  },
  error: {
    surface: 'bg-danger-subtle',
    border: 'border-danger-line',
    pill: 'bg-danger-subtle',
    text: 'text-danger-strong',
    icon: 'close-circle',
    iconColor: colors.dangerStrong,
  },
  neutral: {
    surface: 'bg-surface',
    border: 'border-line-subtle',
    pill: 'bg-canvas',
    text: 'text-ink-muted',
    icon: 'information-circle',
    iconColor: colors.inkMuted,
  },
};

/** The icon and its colour for a tone, for a status shown inline next to a sentence. */
export function toneIcon(tone: Tone): { name: IconName; color: string } {
  return { name: TONE[tone].icon, color: TONE[tone].iconColor };
}

/** primary: the screen's main action; secondary: an alternative; tertiary: a quiet one; danger: destroys or refunds. */
export type ButtonTone = 'primary' | 'secondary' | 'tertiary' | 'danger';

export interface ButtonStyle {
  box: string;
  pressed: string;
  text: string;
  /** The label's colour as a value, for the icon and the spinner. */
  foreground: string;
}

export const BUTTON: Record<ButtonTone, ButtonStyle> = {
  primary: {
    box: 'border border-brand bg-brand',
    pressed: 'active:border-brand-strong active:bg-brand-strong',
    text: 'text-brand-on',
    foreground: colors.brandOn,
  },
  secondary: {
    box: 'border border-brand bg-surface',
    pressed: 'active:bg-brand-subtle',
    text: 'text-brand',
    foreground: colors.brand,
  },
  tertiary: {
    box: 'border border-transparent bg-transparent',
    pressed: 'active:bg-brand-subtle',
    text: 'text-brand',
    foreground: colors.brand,
  },
  danger: {
    box: 'border border-danger bg-danger',
    pressed: 'active:border-danger-strong active:bg-danger-strong',
    text: 'text-brand-on',
    foreground: colors.brandOn,
  },
};

/**
 * Every button looks the same while it cannot be used: grey, not a faded version of its tone.
 * Every style has a 1 dp border (transparent where it is not seen), so a button keeps its size
 * when it changes state.
 */
export const BUTTON_DISABLED: ButtonStyle = {
  box: 'border border-fill bg-fill',
  pressed: '',
  text: 'text-ink-muted',
  foreground: colors.inkMuted,
};
