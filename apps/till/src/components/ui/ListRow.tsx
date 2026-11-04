import { colors } from '@mensa/shared';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { spokenPhrase } from './a11y-text';
import { tabularFigures } from './AmountText';
import { Icon } from './Icon';
import { StatusPill } from './StatusPill';
import type { IconName, Tone } from './styles';

/**
 * One row of a list: a title, an optional status and subtitle, and a trailing value (an amount in
 * tabular figures). With `onPress` it is a button with a chevron. Screen readers hear the row as
 * one phrase in reading order; its parts are hidden from them, so nothing is read twice and no
 * part becomes a separate stop. Rows sit flush in a card; `separated` draws a hairline above.
 * A pressable row can be `busy` (a spinner replaces the chevron, the row keeps its size) or
 * `disabled`; screen readers hear both states.
 */
export function ListRow(props: {
  title: string;
  subtitle?: string;
  value?: string;
  status?: { tone: Tone; label: string };
  /** A leading icon in a tinted circle; decorative, the title carries the meaning. */
  icon?: IconName;
  onPress?: () => void;
  hint?: string;
  separated?: boolean;
  busy?: boolean;
  disabled?: boolean;
}) {
  const label = spokenPhrase([props.title, props.status?.label, props.value, props.subtitle]);
  const inactive = Boolean(props.disabled || props.busy);
  const row = `min-h-touch flex-row items-center gap-3 py-3 ${props.separated ? 'border-t border-line-subtle' : ''}`;
  const content: ReactNode = (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      className="flex-1 flex-row items-center gap-3"
    >
      {props.icon ? (
        <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-subtle">
          <Icon name={props.icon} color={colors.brand} />
        </View>
      ) : null}
      <View className="flex-1 gap-1">
        <Text
          className={`text-body font-semibold ${props.disabled ? 'text-ink-muted' : 'text-ink'}`}
        >
          {props.title}
        </Text>
        {props.status ? <StatusPill tone={props.status.tone} label={props.status.label} /> : null}
        {props.subtitle ? (
          <Text className="text-caption text-ink-muted">{props.subtitle}</Text>
        ) : null}
      </View>
      {props.value ? (
        <Text className="text-body font-semibold text-ink" style={tabularFigures.text}>
          {props.value}
        </Text>
      ) : null}
      {props.busy ? (
        <ActivityIndicator color={colors.brand} />
      ) : props.onPress ? (
        <Icon name="chevron-forward" size="sm" color={colors.inkMuted} />
      ) : null}
    </View>
  );

  if (!props.onPress) {
    return (
      <View accessible accessibilityLabel={label} className={row}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={props.hint}
      accessibilityState={{ disabled: inactive, busy: Boolean(props.busy) }}
      disabled={inactive}
      onPress={props.onPress}
      className={`${row} ${inactive ? '' : 'active:opacity-70'}`}
    >
      {content}
    </Pressable>
  );
}
