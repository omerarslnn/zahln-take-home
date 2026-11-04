import { formatCents } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import { StyleSheet, Text } from 'react-native';

const SIZE = {
  /** The one amount a screen is about (the amount to pay). */
  display: 'text-display font-bold',
  title: 'text-title font-bold',
  body: 'text-body font-semibold',
} as const;

/**
 * An amount the server stated, in integer cents, in the current language's currency format.
 * Tabular figures keep amounts aligned in lists and steady while a value changes. It only formats:
 * the amount always comes from the server, never from a calculation on the device.
 */
export function AmountText({
  cents,
  size = 'body',
  muted,
}: {
  cents: number;
  size?: keyof typeof SIZE;
  muted?: boolean;
}) {
  const { locale } = useI18n();
  return (
    <Text
      className={`${SIZE[size]} ${muted ? 'text-ink-muted' : 'text-ink'}`}
      style={tabularFigures.text}
    >
      {formatCents(cents, locale)}
    </Text>
  );
}

/** Equal-width digits, for every amount and figure that is compared or updates in place. */
export const tabularFigures = StyleSheet.create({ text: { fontVariant: ['tabular-nums'] } });
