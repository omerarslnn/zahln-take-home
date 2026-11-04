import { colors, motion, radius } from '@mensa/shared';
import { useEffect } from 'react';
import { ActivityIndicator, Text, View, type DimensionValue } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/**
 * A spinner with words, read once as one element ("Loading payments"). It has no live region and
 * no role that makes screen readers repeat it: the words are found when the user reaches them.
 */
export function LoadingIndicator({ label }: { label: string }) {
  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      className="flex-row items-center justify-center gap-3 py-6"
    >
      <ActivityIndicator color={colors.brand} />
      <Text className="text-body text-ink-muted">{label}</Text>
    </View>
  );
}

/**
 * A grey placeholder for content on its way. Hidden from screen readers: the screen around it
 * says what is loading (with a LoadingIndicator or a heading). It pulses gently, and stays still
 * when the system asks for reduced motion.
 */
export function Skeleton({
  width = '100%',
  height = 16,
  rounded = 'control',
}: {
  width?: DimensionValue;
  height?: number;
  rounded?: 'control' | 'full';
}) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) return;
    opacity.value = withRepeat(withTiming(0.5, { duration: motion.pulseMs }), -1, true);
    return () => cancelAnimation(opacity);
  }, [reduceMotion, opacity]);
  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[
        {
          width,
          height,
          borderRadius: rounded === 'full' ? height / 2 : radius.control,
          backgroundColor: colors.fill,
        },
        pulse,
      ]}
    />
  );
}
