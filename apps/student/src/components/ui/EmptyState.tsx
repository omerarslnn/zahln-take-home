import { colors } from '@mensa/shared';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { Icon } from './Icon';
import type { IconName } from './styles';

/**
 * What a list or screen says when there is nothing to show, and what to do about it. The words
 * are one accessible group; the optional action stays a separate button.
 */
export function EmptyState({
  icon = 'file-tray-outline',
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <View className="items-center gap-4 px-6 py-10">
      <View className="h-14 w-14 items-center justify-center rounded-full bg-canvas">
        <Icon name={icon} size="lg" color={colors.inkMuted} />
      </View>
      <View accessible className="items-center gap-1">
        <Text className="text-center text-headline font-semibold text-ink">{title}</Text>
        {description ? (
          <Text className="text-center text-body text-ink-muted">{description}</Text>
        ) : null}
      </View>
      {action ? <View className="self-stretch">{action}</View> : null}
    </View>
  );
}
