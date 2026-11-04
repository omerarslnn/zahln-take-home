import { colors, space } from '@mensa/shared';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardOpen } from './hooks';

/**
 * The screen's persistent actions below the scrolling content: above the home indicator, and
 * directly on top of the keyboard while it is open (the safe-area padding is then dropped, as
 * the keyboard covers that area). A hairline separates it from the content scrolling under it.
 */
export function BottomActionBar({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const keyboardOpen = useKeyboardOpen();
  return (
    <View
      className="gap-3 border-t border-line-subtle bg-surface px-4 pt-3"
      style={{ paddingBottom: (keyboardOpen ? 0 : insets.bottom) + space.stack }}
    >
      {children}
    </View>
  );
}

/**
 * A scrolling screen body on the canvas: 16 dp gutters, 16 dp between blocks, the safe area
 * respected, usable with the keyboard open. `footer` goes into a BottomActionBar.
 */
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
        contentContainerStyle={{
          paddingBottom: footer ? space.gutter : insets.bottom + space.gutter,
        }}
      >
        {children}
      </ScrollView>
      {footer ? <BottomActionBar>{footer}</BottomActionBar> : null}
    </KeyboardAvoidingView>
  );
}
