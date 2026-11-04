import { useIsFocused } from '@react-navigation/native';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  AppState,
  Keyboard,
  Platform,
  type Text,
  type View,
} from 'react-native';

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

/**
 * Whether the software keyboard is open. iOS reports it as it starts moving (so a bar can move
 * with it); Android only once it is shown.
 */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () =>
      setOpen(true),
    );
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setOpen(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return open;
}
