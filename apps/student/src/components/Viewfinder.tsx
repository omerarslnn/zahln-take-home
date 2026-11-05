import { colors } from '@mensa/shared';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon } from './ui';

const CORNER = 32;
const STROKE = 4;
const CORNERS = [
  { top: 0, left: 0, borderTopWidth: STROKE, borderLeftWidth: STROKE, borderTopLeftRadius: 12 },
  { top: 0, right: 0, borderTopWidth: STROKE, borderRightWidth: STROKE, borderTopRightRadius: 12 },
  {
    bottom: 0,
    left: 0,
    borderBottomWidth: STROKE,
    borderLeftWidth: STROKE,
    borderBottomLeftRadius: 12,
  },
  {
    bottom: 0,
    right: 0,
    borderBottomWidth: STROKE,
    borderRightWidth: STROKE,
    borderBottomRightRadius: 12,
  },
] as const;

/**
 * A square, dark frame with corner guides for the QR code. `camera` is the live preview, or null
 * while the camera is off (permission, a problem on screen, the app in the background): the frame
 * keeps its place and shows a QR glyph, so the page does not jump when the camera starts or stops.
 * The guides are drawn above the preview and are invisible to touch and to screen readers.
 */
export function Viewfinder({ camera, label }: { camera: ReactNode | null; label: string }) {
  return (
    <View
      accessible
      accessibilityLabel={label}
      className="w-full overflow-hidden rounded-card bg-ink"
      style={{ aspectRatio: 1 }}
    >
      {camera ?? (
        <View className="flex-1 items-center justify-center">
          <Icon name="qr-code-outline" size="xl" color={colors.line} />
        </View>
      )}
      <View
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={StyleSheet.absoluteFill}
        className="items-center justify-center"
      >
        <View style={{ width: '64%', aspectRatio: 1 }}>
          {CORNERS.map((corner, index) => (
            <View
              key={index}
              style={[
                {
                  position: 'absolute',
                  width: CORNER,
                  height: CORNER,
                  borderColor: colors.brandOn,
                },
                corner,
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}
