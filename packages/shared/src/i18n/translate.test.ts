import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pickLocale, translate } from './translate';

describe('translate', () => {
  it('fills placeholders in the chosen language', () => {
    assert.equal(
      translate('de', 'connection.success', { status: 200, duration: 312 }),
      'Erreichbar: HTTP 200 in 312 ms',
    );
  });

  it('leaves a placeholder visible when its value is missing', () => {
    assert.equal(translate('en', 'connection.minAppVersion', {}), 'Minimum app version: {value}');
  });
});

describe('pickLocale', () => {
  it('maps any German tag to de and everything else to en', () => {
    assert.equal(pickLocale('de-AT'), 'de');
    assert.equal(pickLocale('DE'), 'de');
    assert.equal(pickLocale('tr-TR'), 'en');
    assert.equal(pickLocale(undefined), 'en');
  });
});
