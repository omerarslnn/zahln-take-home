// Design tokens live in tokens.json so the Tailwind preset (plain CommonJS) and TypeScript code
// read one source. Contrast ratios of the colour pairs are recorded in docs/architecture.md.
import tokens from './tokens.json';

export const colors = tokens.color;
export const radius = tokens.radius;
/** Minimum touch target in dp / CSS px: Material's 48 dp, above Apple's 44 pt and WCAG 2.2's 24 px. */
export const touchTarget = tokens.size.touchTarget;

export type ColorToken = keyof typeof colors;
