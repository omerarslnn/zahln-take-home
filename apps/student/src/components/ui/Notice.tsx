import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { Icon } from './Icon';
import { TONE, type Tone } from './styles';

/**
 * A banner: an icon and words for what happened, on a surface tinted by its tone, and the actions
 * for it underneath.
 *
 * The title and description form one accessible group, so screen readers read the message as one
 * stop. The actions sit outside that group, so each is its own button. Inside an accessible group
 * VoiceOver cannot reach a button at all: the group is a single element to it. That is why the
 * text is plain strings and there are no children: nothing interactive can end up in the group.
 */
export function Notice({
  tone,
  title,
  description,
  actions,
}: {
  tone: Tone;
  title: string;
  /** Plain text under the title, read with it. */
  description?: string;
  /** Buttons for this notice, read after its text. */
  actions?: ReactNode;
}) {
  const style = TONE[tone];
  return (
    <View className={`gap-3 rounded-card border p-4 ${style.surface} ${style.border}`}>
      <View accessible className="flex-row gap-3">
        <View className="h-6 justify-center">
          <Icon name={style.icon} color={style.iconColor} />
        </View>
        <View className="flex-1 gap-1">
          <Text className="text-body font-semibold text-ink">{title}</Text>
          {description ? <Text className="text-body text-ink-muted">{description}</Text> : null}
        </View>
      </View>
      {actions ? <View className="gap-2">{actions}</View> : null}
    </View>
  );
}
