// The primitives' style tables against WCAG AA, with the real token values. The till's copy of
// this folder is identical (`pnpm check:copies`), so this covers both apps.
import { colors, type ColorToken } from '@mensa/shared';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AA_NON_TEXT,
  AA_TEXT,
  contrastRatio,
} from '../../../../../packages/shared/src/testing/contrast';
import { BUTTON, BUTTON_DISABLED, TONE, type ButtonStyle, type Tone } from './styles';

/** The colour of the first `prefix…` class in `classes` ("bg-brand-strong" → brandStrong). */
function tokenOf(classes: string, prefix: string): string | null {
  const name = classes
    .split(' ')
    .find((cls) => cls.startsWith(prefix))
    ?.slice(prefix.length);
  if (!name || name === 'transparent') return null;
  const key = name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
  assert.ok(key in colors, `${prefix}${name} is not a colour token`);
  return colors[key as ColorToken];
}

const TONES = Object.keys(TONE) as Tone[];

describe('tone styles (banners and status pills)', () => {
  for (const tone of TONES) {
    const style = TONE[tone];
    it(`${tone}: pill text, banner text and icon have enough contrast`, () => {
      const pill = tokenOf(style.pill, 'bg-') ?? assert.fail('pill surface');
      const banner = tokenOf(style.surface, 'bg-') ?? assert.fail('banner surface');
      const pillText = tokenOf(style.text, 'text-') ?? assert.fail('pill text');
      assert.ok(contrastRatio(pillText, pill) >= AA_TEXT, 'pill label');
      assert.ok(contrastRatio(colors.ink, banner) >= AA_TEXT, 'banner title');
      assert.ok(contrastRatio(colors.inkMuted, banner) >= AA_TEXT, 'banner description');
      assert.ok(contrastRatio(style.iconColor, banner) >= AA_NON_TEXT, 'icon on the banner');
      assert.ok(contrastRatio(style.iconColor, pill) >= AA_NON_TEXT, 'icon on the pill');
    });
  }

  it('every tone has its own icon, so tones differ without colour', () => {
    const icons = TONES.map((tone) => TONE[tone].icon);
    assert.equal(new Set(icons).size, icons.length, icons.join(', '));
  });
});

describe('button styles', () => {
  const styles: [string, ButtonStyle][] = [
    ...Object.entries(BUTTON),
    ['disabled', BUTTON_DISABLED],
  ];
  for (const [name, style] of styles) {
    it(`${name}: the label is readable at rest and pressed, on every background it can sit on`, () => {
      const label = tokenOf(style.text, 'text-') ?? assert.fail('label colour');
      // A transparent button shows the card or the screen behind it.
      const rest = tokenOf(style.box, 'bg-');
      const backgrounds = rest ? [rest] : [colors.surface, colors.canvas];
      const pressed = tokenOf(style.pressed, 'active:bg-');
      for (const background of [...backgrounds, ...(pressed ? [pressed] : [])]) {
        assert.ok(contrastRatio(label, background) >= AA_TEXT, `${label} on ${background}`);
      }
      assert.equal(style.foreground, label, 'icon and spinner use the label colour');
    });

    it(`${name}: has a 1 dp border, so changing state never changes its size`, () => {
      assert.ok(style.box.split(' ').includes('border'), style.box);
    });
  }

  it('the secondary button is outlined in a colour that meets 3:1', () => {
    const border = tokenOf(BUTTON.secondary.box, 'border-') ?? assert.fail('border colour');
    assert.ok(contrastRatio(border, colors.surface) >= AA_NON_TEXT);
    assert.ok(contrastRatio(border, colors.canvas) >= AA_NON_TEXT);
  });
});
