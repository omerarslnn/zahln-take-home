// Expo (SDK 52+) configures Metro for the monorepo itself: it watches the workspace root and
// resolves the symlinked workspace packages. Only NativeWind's CSS pipeline is added here.
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

module.exports = withNativeWind(getDefaultConfig(__dirname), { input: './global.css' });
