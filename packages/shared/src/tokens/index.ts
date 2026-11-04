// Design tokens live in tokens.json so the Tailwind preset (plain CommonJS) and TypeScript code
// read one source. The colour pairs the components use are checked for WCAG contrast in
// contrast.test.ts; docs/design-system.md explains every token.
import tokens from './tokens.json';

export const colors = tokens.color;
export const radius = tokens.radius;
export const typeScale = tokens.type;
/** The 4-point grid: `unit`, the screen gutter and the default gap between stacked items, in dp. */
export const space = tokens.space;
/** Icon sizes in dp, aligned to the type scale (md sits next to body text). */
export const iconSize = tokens.size.icon;
/** Minimum touch target in dp / CSS px: Material's 48 dp, above Apple's 44 pt and WCAG 2.2's 24 px. */
export const touchTarget = tokens.size.touchTarget;
export const motion = tokens.motion;

export type ColorToken = keyof typeof colors;
