import { Text, View } from 'react-native';
import { Icon } from './Icon';
import { TONE, type Tone } from './styles';

/** A status in words with an icon, on a tinted pill; the colour only repeats what the words say. */
export function StatusPill({ tone, label }: { tone: Tone; label: string }) {
  const style = TONE[tone];
  return (
    <View
      accessible
      accessibilityLabel={label}
      className={`flex-row items-center gap-1 self-start rounded-full border px-3 py-1 ${style.pill} ${style.border}`}
    >
      <Icon name={style.icon} size="sm" color={style.iconColor} />
      <Text className={`shrink text-caption font-semibold ${style.text}`}>{label}</Text>
    </View>
  );
}
