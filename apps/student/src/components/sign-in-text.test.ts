import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LOCALES, translate, type MessageKey } from '@mensa/shared';
import { missingFieldText, signInFailureText, type SignInFailure } from './sign-in-text';
import { fieldLabel } from './ui/a11y-text';

const SHOWN: SignInFailure[] = [
  'invalid_credentials',
  'no_connection',
  'login_unavailable',
  'wrong_role',
  'demo_unavailable',
  'not_configured',
];

/** Every string the sign-in screens show or speak, besides the failures. */
const SIGN_IN_KEYS: MessageKey[] = [
  'signIn.welcome',
  'signIn.tagline',
  'signIn.form.title',
  'signIn.username',
  'signIn.password',
  'signIn.password.show',
  'signIn.password.hide',
  'signIn.submit',
  'signIn.missing.username',
  'signIn.missing.password',
  'signIn.noRegistration',
  'signIn.demo.title',
  'signIn.demo.description',
  'signIn.demo.hint',
  'signIn.demo.student',
  'signIn.demo.student.detail',
  'signIn.demo.staff',
  'signIn.demo.staff.detail',
  'signIn.demo.guest',
  'signIn.demo.guest.detail',
  'till.signIn.tagline',
  'till.signIn.form.title',
  'till.signIn.serverAssigns',
  'till.signIn.noRegistration',
  'till.signIn.demo.title',
  'till.signIn.demo.description',
];

describe('sign-in failure messages', () => {
  it('gives each failure its own message, and nothing for replaced or overlapping attempts', () => {
    const keys = SHOWN.map((reason) => signInFailureText(reason, 'student'));
    assert.equal(new Set(keys).size, SHOWN.length);
    assert.ok(keys.every(Boolean));
    for (const quiet of ['superseded', 'in_progress', 'missing_input'] as const) {
      assert.equal(signInFailureText(quiet, 'student'), null);
    }
  });

  it('explains a wrong role in terms of the app the user is in', () => {
    const student = signInFailureText('wrong_role', 'student');
    const till = signInFailureText('wrong_role', 'till');
    assert.ok(student && till && student !== till);
    assert.match(translate('en', student), /student, staff or guest/);
    assert.match(translate('de', till), /Kassenkonto/);
  });

  it('is translated: German and English differ, and no placeholder is left', () => {
    for (const app of ['student', 'till'] as const) {
      for (const reason of SHOWN) {
        const key = signInFailureText(reason, app);
        assert.ok(key);
        const [de, en] = [translate('de', key), translate('en', key)];
        assert.notEqual(de, en, key);
        assert.doesNotMatch(`${de} ${en}`, /\{\w+\}/, key);
      }
    }
  });
});

describe('sign-in field errors and labels', () => {
  it('names each empty field', () => {
    assert.deepEqual(missingFieldText({ username: true, password: false }), {
      username: 'signIn.missing.username',
      password: null,
    });
    assert.deepEqual(missingFieldText(null), { username: null, password: null });
  });

  it('reads the error as part of the field label, in the current language', () => {
    const label = (locale: 'de' | 'en') =>
      fieldLabel(
        translate(locale, 'signIn.username'),
        translate(locale, 'signIn.missing.username'),
      );
    assert.equal(label('de'), 'Benutzername, Gib deinen Benutzernamen ein.');
    assert.equal(label('en'), 'Username, Enter your username.');
  });

  it('labels the password button by what it does next, in both languages', () => {
    assert.equal(translate('en', 'signIn.password.show'), 'Show password');
    assert.equal(translate('de', 'signIn.password.hide'), 'Passwort ausblenden');
  });

  it('has a non-empty, translated text for every sign-in string', () => {
    for (const key of SIGN_IN_KEYS) {
      const texts = LOCALES.map((locale) => translate(locale, key));
      assert.ok(
        texts.every((text) => text.trim().length > 0),
        key,
      );
      assert.notEqual(texts[0], texts[1], key);
    }
    assert.equal(translate('de', 'till.signIn.demo.cashier', { number: 2 }), 'Kassenkonto 2');
  });
});
