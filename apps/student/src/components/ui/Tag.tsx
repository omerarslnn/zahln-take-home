import { colors } from '@mensa/shared';
import { Text, View } from 'react-native';
import { Icon } from './Icon';
import type { IconName } from './styles';

/**
 * A fact about the account or the order, such as its price group, on a light brand tint. Not a
 * status (use StatusPill for those): it has no tone and never changes with a result.
 */
export function Tag({ label, icon }: { label: string; icon?: IconName }) {
  return (
    <View className="flex-row items-center gap-1 self-start rounded-full bg-brand-subtle px-3 py-1">
      {icon ? <Icon name={icon} size="sm" color={colors.brandStrong} /> : null}
      <Text className="shrink text-caption font-semibold text-brand-strong">{label}</Text>
    </View>
  );
}
