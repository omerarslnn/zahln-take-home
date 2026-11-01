// Building blocks of the product screens, on the shared design tokens. The till has an identical
// copy. Every status has a glyph and words, never colour alone; every control is at least 48 dp.
import { colors } from '@mensa/shared';
import { useIsFocused } from '@react-navigation/native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ButtonTone = 'primary' | 'secondary' | 'danger';

const BUTTON: Record<ButtonTone, { box: string; text: string; spinner: string }> = {
  primary: { box: 'bg-brand', text: 'text-brand-on', spinner: '#FFFFFF' },
  secondary: { box: 'border-2 border-brand bg-surface', text: 'text-brand', spinner: '#1D4ED8' },
  danger: { box: 'bg-danger', text: 'text-white', spinner: '#FFFFFF' },
};

export function Button(props: {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  disabled?: boolean;
  /** Shows progress and blocks taps while the action runs. */
  busy?: boolean;
  accessibilityLabel?: string;
  hint?: string;
}) {
  const style = BUTTON[props.tone ?? 'primary'];
  const inactive = Boolean(props.disabled || props.busy);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      accessibilityHint={props.hint}
      accessibilityState={{ disabled: inactive, busy: Boolean(props.busy) }}
      disabled={inactive}
      onPress={props.onPress}
      className={`min-h-touch flex-row items-center justify-center gap-2 rounded-control px-4 py-2 active:opacity-80 ${style.box} ${inactive ? 'opacity-50' : ''}`}
    >
      {props.busy ? <ActivityIndicator color={style.spinner} /> : null}
      <Text className={`text-center text-base font-semibold ${style.text}`}>{props.label}</Text>
    </Pressable>
  );
}

/** A scrolling screen body that respects the safe area and stays usable with the keyboard open. */
export function Screen({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    // A plain style, not className: NativeWind did not apply classes to KeyboardAvoidingView here
    // (seen on Android in a release build and in Expo Go), which left every screen empty.
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-4 px-4 pt-4"
        contentContainerStyle={{ paddingBottom: footer ? 16 : insets.bottom + 16 }}
      >
        {children}
      </ScrollView>
      {footer ? (
        <View
          className="gap-3 border-t border-line bg-surface px-4 pt-3"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

export type Tone = 'ok' | 'pending' | 'warning' | 'error' | 'neutral';

const TONE: Record<Tone, { glyph: string; box: string }> = {
  ok: { glyph: '✓', box: 'bg-success' },
  pending: { glyph: '…', box: 'bg-brand' },
  warning: { glyph: '!', box: 'bg-warning' },
  error: { glyph: '✕', box: 'bg-danger' },
  neutral: { glyph: '•', box: 'bg-line' },
};

/** A status in words with a glyph; the colour only repeats what the words say. */
export function StatusBadge({ tone, label }: { tone: Tone; label: string }) {
  const style = TONE[tone];
  return (
    <View
      accessible
      accessibilityLabel={label}
      className={`flex-row items-center gap-2 self-start rounded-control px-3 py-1 ${style.box}`}
    >
      <Text className="text-base font-bold text-white">{style.glyph}</Text>
      <Text className="flex-shrink text-base font-semibold text-white">{label}</Text>
    </View>
  );
}

/** An explanatory box; `tone` adds a glyph and border colour to words that stand on their own. */
export function Notice({
  tone,
  title,
  children,
}: {
  tone: Tone;
  title?: string;
  children?: ReactNode;
}) {
  const border =
    tone === 'error' ? 'border-danger' : tone === 'warning' ? 'border-warning' : 'border-line';
  return (
    <View accessible className={`gap-1 rounded-card border-l-4 bg-surface p-4 ${border}`}>
      {title ? (
        <Text className="text-base font-semibold text-ink">
          {TONE[tone].glyph} {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Text className={`text-base ${muted ? 'text-ink-muted' : 'text-ink'}`}>{children}</Text>;
}

/**
 * Says `message` to the screen reader once when it changes to a new non-empty value: a payment's
 * outcome, a refund's state, payments being paused. Never for every polling tick, because an
 * unchanged message is not repeated. Only while this screen is focused: a change on a screen
 * underneath (the checkout behind the payments list) is not spoken over the screen in front, and
 * not saved up for later. With `changesOnly`, what the screen showed when it opened is the
 * baseline, not news; its heading and focus present it.
 *
 * This is the one announcement path on both platforms: announceForAccessibility reaches VoiceOver,
 * which has no live regions, and TalkBack. A message spoken here must not also sit in an Android
 * live region, or TalkBack says it twice.
 */
export function useAnnouncement(message: string | null, changesOnly = false): void {
  const focused = useIsFocused();
  const last = useRef<string | null>(changesOnly ? message : null);
  useEffect(() => {
    if (!message) {
      last.current = null; // gone; if it comes back, that is news again
      return;
    }
    if (message === last.current) return;
    last.current = message;
    if (focused) AccessibilityInfo.announceForAccessibility(message);
  }, [message, focused]);
}

/** Moves screen-reader focus to the element when `key` changes, e.g. to a new result heading. */
export function useAccessibilityFocus<T extends View | Text>(key: string | null) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!key || !ref.current) return;
    const target = ref.current;
    // After layout, or the screen reader may still be on the element that was there before.
    const timer = setTimeout(() => AccessibilityInfo.sendAccessibilityEvent(target, 'focus'), 300);
    return () => clearTimeout(timer);
  }, [key]);
  return ref;
}

/** Whether the app is in the foreground; the camera and countdowns stop when it is not. */
export function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setActive(state === 'active'),
    );
    return () => subscription.remove();
  }, []);
  return active;
}
