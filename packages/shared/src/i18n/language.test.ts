import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveLocale, systemLocale, type LanguageChoice } from './language';
import type { Locale } from './translate';

describe('systemLocale', () => {
  it('uses German for every German preference', () => {
    for (const tag of ['de-DE', 'de-AT', 'de-CH', 'de', 'DE-de', 'de_DE']) {
      assert.equal(systemLocale([tag]), 'de', tag);
    }
  });

  it('uses English for English and for languages the app does not support', () => {
    for (const tag of ['en-US', 'en-GB', 'tr-TR', 'fr', 'gsw-CH', 'dex']) {
      assert.equal(systemLocale([tag]), 'en', tag);
    }
    assert.equal(systemLocale([]), 'en');
    assert.equal(systemLocale([undefined, null, '']), 'en');
  });

  it('takes the first supported language in the preference order, like the platforms do', () => {
    assert.equal(systemLocale(['tr-TR', 'de-DE']), 'de');
    assert.equal(systemLocale(['en-GB', 'de-DE']), 'en');
    assert.equal(systemLocale(['fr-FR', 'en-US', 'de-DE']), 'en');
  });
});

describe('resolveLocale', () => {
  /** What the app shows over a sequence of device-language changes and Diagnostics choices. */
  function run(steps: ({ device: string[] } | { choose: LanguageChoice })[]): Locale[] {
    let device: Locale = 'en';
    let choice: LanguageChoice = 'system';
    return steps.map((step) => {
      if ('device' in step) device = systemLocale(step.device);
      else choice = step.choose;
      return resolveLocale(choice, device);
    });
  }

  it('follows the device language when it changes', () => {
    assert.deepEqual(run([{ device: ['en-US'] }, { device: ['de-DE'] }, { device: ['tr-TR'] }]), [
      'en',
      'de',
      'en',
    ]);
  });

  it('keeps a Diagnostics override through device changes, until "follow system" again', () => {
    assert.deepEqual(
      run([
        { device: ['de-DE'] },
        { choose: 'en' },
        { device: ['de-AT'] },
        { choose: 'system' },
        { device: ['en-US'] },
      ]),
      ['de', 'en', 'en', 'de', 'en'],
    );
  });
});
