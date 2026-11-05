import { motion } from '@mensa/shared';
import { useEffect, type Ref } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { AmountText, Icon, TONE, type IconName, type Tone } from './ui';

/**
 * The result's hero: the state's icon on its tint, the state as the screen's heading, what it
 * means, and the amount. With `celebrate` (only a server-confirmed payment) the icon scales in
 * once; under reduced motion, and for every other state, it simply appears.
 */
export function OutcomeHero({
  tone,
  icon,
  celebrate,
  title,
  body,
  amountCents,
  headingRef,
}: {
  tone: Tone;
  icon: IconName;
  celebrate: boolean;
  title: string;
  body: string;
  amountCents: number;
  headingRef?: Ref<Text>;
}) {
  const style = TONE[tone];
  const reduceMotion = useReducedMotion();
  const animate = celebrate && !reduceMotion;
  const progress = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (!animate) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: motion.celebrateMs,
      easing: Easing.out(Easing.back(1.7)),
    });
  }, [animate, progress]);
  const pop = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.value * 1.5),
    transform: [{ scale: 0.6 + 0.4 * progress.value }],
  }));

  return (
    <View className="items-center gap-3 py-4">
      <Animated.View style={pop}>
        <View className={`items-center justify-center rounded-full p-4 ${style.surface}`}>
          <Icon name={icon} size="hero" color={style.iconColor} />
        </View>
      </Animated.View>
      <Text
        ref={headingRef}
        accessibilityRole="header"
        className="text-center text-title font-bold text-ink"
      >
        {title}
      </Text>
      <Text className="text-center text-body text-ink-muted">{body}</Text>
      <AmountText cents={amountCents} size="display" />
    </View>
  );
}
