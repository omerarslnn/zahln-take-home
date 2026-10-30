import sharedPreset from '@mensa/shared/tailwind-preset';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  presets: [sharedPreset],
};
