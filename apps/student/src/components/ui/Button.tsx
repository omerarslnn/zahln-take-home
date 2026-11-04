import { colors } from '@mensa/shared';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Icon } from './Icon';
import { BUTTON, BUTTON_DISABLED, type ButtonTone, type IconName } from './styles';

/**
 * A full-width action, at least 48 dp tall; its label wraps rather than being cut off. While
 * `busy`, a spinner covers the label, which keeps its place, so the button does not change size
 * and the text under it does not move; taps are blocked, and screen readers hear "busy".
 */
export function Button(props: {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  disabled?: boolean;
  busy?: boolean;
  /** A leading icon; the label alone carries the meaning. */
  icon?: IconName;
  accessibilityLabel?: string;
  hint?: string;
}) {
  const inactive = Boolean(props.disabled || props.busy);
  // A busy button keeps its tone: the action is running, not unavailable.
  const style = props.disabled ? BUTTON_DISABLED : BUTTON[props.tone ?? 'primary'];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      accessibilityHint={props.hint}
      accessibilityState={{ disabled: inactive, busy: Boolean(props.busy) }}
      disabled={inactive}
      onPress={props.onPress}
      className={`min-h-touch justify-center rounded-control px-5 py-3 ${style.box} ${inactive ? '' : style.pressed}`}
    >
      <View
        className={`flex-row items-center justify-center gap-2 ${props.busy ? 'opacity-0' : ''}`}
      >
        {props.icon ? <Icon name={props.icon} color={style.foreground} /> : null}
        <Text className={`shrink text-center text-body font-semibold ${style.text}`}>
          {props.label}
        </Text>
      </View>
      {props.busy ? (
        <View className="absolute inset-0 items-center justify-center">
          <ActivityIndicator color={style.foreground} />
        </View>
      ) : null}
    </Pressable>
  );
}

/** An icon-only action: 48 × 48 dp, and `label` is what screen readers say, so it is required. */
export function IconButton(props: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityHint={props.hint}
      accessibilityState={{ disabled: Boolean(props.disabled) }}
      disabled={props.disabled}
      onPress={props.onPress}
      className="min-h-touch min-w-touch items-center justify-center rounded-full active:bg-fill"
    >
      <Icon name={props.icon} size="lg" color={props.disabled ? colors.line : colors.ink} />
    </Pressable>
  );
}
