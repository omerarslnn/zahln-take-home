// Expo (SDK 52+) configures Metro for the monorepo itself: it watches the workspace root and
// resolves the symlinked workspace packages. Only NativeWind's CSS pipeline is added here.
// inlineRem: NativeWind's native default is 14, which made `p-4` 14 dp and `text-base` 14 dp. At 16,
// Tailwind's rem scale is the same 4-point grid as on the web (docs/design-system.md).
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

module.exports = withNativeWind(getDefaultConfig(__dirname), {
  input: './global.css',
  inlineRem: 16,
});
