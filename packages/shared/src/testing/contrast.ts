// Test-only. WCAG 2.x contrast between two opaque sRGB colours (#RRGGBB). Not exported from the
// package index, so it never ships in an app bundle.

/** WCAG relative luminance of an opaque `#RRGGBB` colour. */
function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio from 1 to 21; the order of the two colours does not matter. */
export function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

/** WCAG AA: 4.5:1 for text, 3:1 for large text, icons and the boundaries of controls. */
export const AA_TEXT = 4.5;
export const AA_NON_TEXT = 3;
