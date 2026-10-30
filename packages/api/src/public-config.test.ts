import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parsePublicApiConfig } from './public-config';

describe('parsePublicApiConfig', () => {
  it('accepts an https origin and a candidate id', () => {
    assert.deepEqual(
      parsePublicApiConfig({ baseUrl: 'https://dev.zahln.de', candidateId: 'c_1' }),
      {
        ok: true,
        config: { baseUrl: 'https://dev.zahln.de', candidateId: 'c_1' },
      },
    );
  });

  it('names what is missing, and rejects plain http outside localhost', () => {
    assert.deepEqual(parsePublicApiConfig({ baseUrl: 'http://dev.zahln.de', candidateId: ' ' }), {
      ok: false,
      missing: ['baseUrl', 'candidateId'],
    });
    assert.equal(
      parsePublicApiConfig({ baseUrl: 'http://localhost:8000', candidateId: 'c' }).ok,
      true,
    );
  });
});
