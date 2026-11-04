// The sign-in form and its state, shared by both apps' sign-in screens. The student app has an
// identical copy. Typed credentials and one-tap demo accounts share one state: one attempt at a
// time, one failure notice, one announcement.
import { checkCredentials, type MissingFields } from '@mensa/domain';
import { colors, type MessageKey } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import { useRef, useState } from 'react';
import { Keyboard, Text, View, type TextInput } from 'react-native';
import type { SignInOutcome } from '../payments/PaymentServices';
import { usePaymentServices } from '../payments/PaymentServices';
import { missingFieldText, signInFailureText } from './sign-in-text';
import {
  Body,
  Button,
  Caption,
  Card,
  Icon,
  Notice,
  PasswordField,
  TextField,
  useAnnouncement,
  type IconName,
} from './ui';
import { spokenPhrase } from './ui/a11y-text';

/** `pending` while the typed credentials are being checked; otherwise the demo username. */
const FORM = 'form';

export interface SignInState {
  /** What is being signed in right now: the form, a demo username, or nothing. */
  pending: string | null;
  failure: MessageKey | null;
  missing: MissingFields | null;
  submit: (username: string, password: string) => Promise<SignInOutcome | null>;
  signInDemo: (username: string) => Promise<SignInOutcome | null>;
}

/**
 * The screen's sign-in state. A second tap while an attempt runs does nothing (the ref answers
 * before React has re-rendered; `SignInFlow` refuses it as well). Empty fields are reported at
 * once, without a request and without a spinner. The outcome is announced once per attempt.
 */
export function useSignIn(app: 'student' | 'till'): SignInState {
  const { t } = useI18n();
  const { signIn, signInDemo } = usePaymentServices();
  const running = useRef(false);
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState<MessageKey | null>(null);
  const [missing, setMissing] = useState<MissingFields | null>(null);

  async function attempt(target: string, run: () => Promise<SignInOutcome>) {
    if (running.current) return null;
    running.current = true;
    setPending(target);
    setFailure(null);
    setMissing(null);
    try {
      const result = await run();
      if (!result.ok && result.reason === 'missing_input') setMissing(result.missing);
      else if (!result.ok) setFailure(signInFailureText(result.reason, app));
      return result;
    } finally {
      running.current = false;
      setPending(null);
    }
  }

  const fieldErrors = missingFieldText(missing);
  useAnnouncement(
    failure
      ? t(failure)
      : missing
        ? spokenPhrase([fieldErrors.username, fieldErrors.password].map((key) => key && t(key)))
        : null,
  );

  return {
    pending,
    failure,
    missing,
    submit: (username, password) => {
      const checked = checkCredentials(username, password);
      if (!checked.ok) {
        setFailure(null);
        setMissing(checked.missing);
        return Promise.resolve(null);
      }
      Keyboard.dismiss();
      return attempt(FORM, () => signIn(username, password));
    },
    signInDemo: (username) => attempt(username, () => signInDemo(username)),
  };
}

/**
 * Username and password with native autofill, the return key moving to the password and then
 * submitting, a show/hide button, errors at the fields and a failure notice above them.
 */
export function SignInForm(props: {
  state: SignInState;
  title: string;
  /** Under the button: e.g. that this demo has no registration. */
  footnote: string;
  /** False when the build cannot sign anyone in (missing API settings). */
  enabled: boolean;
}) {
  const { t } = useI18n();
  const { state } = props;
  const passwordRef = useRef<TextInput>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const errors = missingFieldText(state.missing);
  const busy = state.pending === FORM;
  // The fields stay editable while the request runs (it uses the values sent): disabling the
  // focused field would move keyboard focus away from it.
  const editable = props.enabled;

  async function submit() {
    if (!props.enabled) return;
    const result = await state.submit(username, password);
    // Credentials refused, or an account this app cannot use: the password is cleared, the
    // username kept to correct a typo.
    if (
      result &&
      !result.ok &&
      (result.reason === 'invalid_credentials' || result.reason === 'wrong_role')
    ) {
      setPassword('');
    }
  }

  return (
    <Card title={props.title}>
      {state.failure ? (
        <Notice tone="error" title={t('signIn.failed')} description={t(state.failure)} />
      ) : null}
      <TextField
        label={t('signIn.username')}
        value={username}
        onChangeText={setUsername}
        error={errors.username ? t(errors.username) : null}
        editable={editable}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        autoComplete="username"
        textContentType="username"
        importantForAutofill="yes"
        maxLength={100}
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <PasswordField
        ref={passwordRef}
        label={t('signIn.password')}
        showLabel={t('signIn.password.show')}
        hideLabel={t('signIn.password.hide')}
        value={password}
        onChangeText={setPassword}
        error={errors.password ? t(errors.password) : null}
        editable={editable}
        maxLength={100}
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
      />
      <Button
        label={t('signIn.submit')}
        icon="log-in-outline"
        busy={busy}
        disabled={!props.enabled || (state.pending !== null && !busy)}
        onPress={() => void submit()}
      />
      <Caption>{props.footnote}</Caption>
    </Card>
  );
}

/** The app's mark, its name as the screen's heading, and one line about what it is for. */
export function BrandHeader(props: { icon: IconName; title: string; tagline: string }) {
  return (
    <View className="gap-4">
      <View className="h-14 w-14 items-center justify-center rounded-card bg-brand">
        <Icon name={props.icon} size="xl" color={colors.brandOn} />
      </View>
      <View className="gap-2">
        <Text accessibilityRole="header" className="text-title font-bold text-ink">
          {props.title}
        </Text>
        <Body muted>{props.tagline}</Body>
      </View>
    </View>
  );
}
