import type { ReactNode } from 'react';
import { Text } from 'react-native';

// The type scale (tokens.json `type`): title 28, headline 18, body 16, caption 13; amounts use
// display 40 (AmountText). System fonts only: SF Pro on iOS, Roboto on Android.

/** The screen's title, announced as a heading. One per screen. */
export function Title({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="header" className="text-title font-bold text-ink">
      {children}
    </Text>
  );
}

/** A section or card heading, announced as a heading. */
export function Heading({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="header" className="text-headline font-semibold text-ink">
      {children}
    </Text>
  );
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Text className={`text-body ${muted ? 'text-ink-muted' : 'text-ink'}`}>{children}</Text>;
}

/** Secondary detail: times, IDs, explanations under a value. Always in the muted ink. */
export function Caption({ children }: { children: ReactNode }) {
  return <Text className="text-caption text-ink-muted">{children}</Text>;
}
