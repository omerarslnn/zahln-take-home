// Shared Tailwind theme for the native apps (through NativeWind) and the web dashboard.
// It reads the same tokens.json as the TypeScript code, so a colour changes in one place.
// NativeWind maps px values to density-independent points on iOS and Android.
const tokens = require('./src/tokens/tokens.json');

const px = (value) => `${value}px`;

/** @type {Partial<import('tailwindcss').Config>} */
module.exports = {
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: tokens.color.brand, on: tokens.color.brandOn },
        ink: { DEFAULT: tokens.color.ink, muted: tokens.color.inkMuted },
        surface: tokens.color.surface,
        canvas: tokens.color.canvas,
        line: tokens.color.line,
        success: tokens.color.success,
        warning: tokens.color.warning,
        danger: tokens.color.danger,
      },
      borderRadius: {
        control: px(tokens.radius.control),
        card: px(tokens.radius.card),
      },
      minHeight: { touch: px(tokens.size.touchTarget) },
      minWidth: { touch: px(tokens.size.touchTarget) },
    },
  },
};
