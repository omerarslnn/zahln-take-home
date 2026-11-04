import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, iconSize } from '@mensa/shared';
import type { IconName } from './styles';

export type IconSize = keyof typeof iconSize;

/**
 * An Ionicons glyph, always decorative: hidden from screen readers, because the words next to it
 * carry the meaning. It grows with the system text size up to 1.5 times, so it stays in
 * proportion to its label without breaking a 48 dp control.
 */
export function Icon({
  name,
  size = 'md',
  color = colors.ink,
}: {
  name: IconName;
  size?: IconSize;
  color?: string;
}) {
  return (
    <Ionicons
      name={name}
      size={iconSize[size]}
      color={color}
      allowFontScaling
      maxFontSizeMultiplier={1.5}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

/**
 * Starts loading the icon font at app start, so the first screen does not show icons a moment
 * late. A failure only leaves icons blank; every icon has words next to it.
 */
export function preloadIcons(): void {
  Ionicons.loadFont().catch(() => undefined);
}
