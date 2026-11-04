// Shared Tailwind theme for the native apps (through NativeWind) and the web dashboard.
// It reads the same tokens.json as the TypeScript code, so a colour changes in one place.
// NativeWind maps px values to density-independent points on iOS and Android, and both apps set
// its rem to 16 (metro.config.js), so the rem-based spacing scale is the same 4-point grid on the
// phone, the till and the web. Type sizes are given in rem, so the dashboard's text still follows
// the browser's font-size setting when it adopts them.
const tokens = require('./src/tokens/tokens.json');

const px = (value) => `${value}px`;
const rem = (value) => `${value / 16}rem`;
const typeStep = ({ size, lineHeight }) => [rem(size), { lineHeight: rem(lineHeight) }];
const c = tokens.color;

/** @type {Partial<import('tailwindcss').Config>} */
module.exports = {
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: c.brand,
          on: c.brandOn,
          strong: c.brandStrong,
          subtle: c.brandSubtle,
          line: c.brandLine,
        },
        ink: { DEFAULT: c.ink, muted: c.inkMuted },
        surface: c.surface,
        canvas: c.canvas,
        fill: c.fill,
        line: { DEFAULT: c.line, subtle: c.lineSubtle },
        success: {
          DEFAULT: c.success,
          strong: c.successStrong,
          subtle: c.successSubtle,
          line: c.successLine,
        },
        warning: {
          DEFAULT: c.warning,
          strong: c.warningStrong,
          subtle: c.warningSubtle,
          line: c.warningLine,
        },
        danger: {
          DEFAULT: c.danger,
          strong: c.dangerStrong,
          subtle: c.dangerSubtle,
          line: c.dangerLine,
        },
      },
      fontSize: {
        display: typeStep(tokens.type.display),
        title: typeStep(tokens.type.title),
        headline: typeStep(tokens.type.headline),
        body: typeStep(tokens.type.body),
        caption: typeStep(tokens.type.caption),
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
