import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AA_NON_TEXT, AA_TEXT, contrastRatio } from '../testing/contrast';
import { colors, type ColorToken } from './index';

/**
 * Every pairing the design system allows, with what it is for. A new pairing (or a new colour
 * value) must pass here before a component uses it; the components' own style tables are checked
 * against the same thresholds in the apps' tests.
 */
const TEXT_PAIRS: [ColorToken, ColorToken, string][] = [
  ['ink', 'surface', 'primary text on cards'],
  ['ink', 'canvas', 'primary text on the screen background'],
  ['inkMuted', 'surface', 'secondary text'],
  ['inkMuted', 'canvas', 'secondary text on the screen background'],
  ['inkMuted', 'fill', 'disabled button labels'],
  ['brand', 'surface', 'links, secondary and tertiary buttons'],
  ['brand', 'canvas', 'tertiary buttons on the screen background'],
  ['brandOn', 'brand', 'primary button label'],
  ['brandOn', 'brandStrong', 'primary button label, pressed'],
  ['brandOn', 'danger', 'destructive button label'],
  ['brandOn', 'dangerStrong', 'destructive button label, pressed'],
  ['success', 'surface', 'success text'],
  ['warning', 'surface', 'warning text'],
  ['danger', 'surface', 'error text and field errors'],
  ...(['brand', 'success', 'warning', 'danger'] as const).flatMap(
    (tone): [ColorToken, ColorToken, string][] => [
      [`${tone}Strong`, `${tone}Subtle`, `${tone} status pill and banner text`],
      ['ink', `${tone}Subtle`, `${tone} banner title`],
      ['inkMuted', `${tone}Subtle`, `${tone} banner description`],
    ],
  ),
];

/** Boundaries a control needs to be seen at all (WCAG 1.4.11). */
const BOUNDARY_PAIRS: [ColorToken, ColorToken, string][] = [
  ['line', 'surface', 'text field and secondary control borders'],
  ['line', 'canvas', 'text field borders on the screen background'],
  ['brand', 'surface', 'secondary button border'],
];

describe('design token contrast (WCAG AA)', () => {
  for (const [foreground, background, use] of TEXT_PAIRS) {
    it(`${foreground} on ${background}: ${use}`, () => {
      const ratio = contrastRatio(colors[foreground], colors[background]);
      assert.ok(ratio >= AA_TEXT, `${ratio.toFixed(2)}:1 is below ${AA_TEXT}:1`);
    });
  }
  for (const [foreground, background, use] of BOUNDARY_PAIRS) {
    it(`${foreground} against ${background}: ${use}`, () => {
      const ratio = contrastRatio(colors[foreground], colors[background]);
      assert.ok(ratio >= AA_NON_TEXT, `${ratio.toFixed(2)}:1 is below ${AA_NON_TEXT}:1`);
    });
  }

  it('the hairline colour is decorative only: too faint to be a control boundary', () => {
    // A guard for the documentation: lineSubtle may separate content, never outline a control.
    assert.ok(contrastRatio(colors.lineSubtle, colors.surface) < AA_NON_TEXT);
  });
});
