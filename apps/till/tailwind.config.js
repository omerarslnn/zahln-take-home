/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.ts', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset'), require('@mensa/shared/tailwind-preset')],
};
