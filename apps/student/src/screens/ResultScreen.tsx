import {
  isFinal,
  paymentDisplay,
  PaymentAuthorizer,
  type IntentRecord,
  type PaymentBinding,
} from '@mensa/domain';
import {
  formatBerlinDateTime,
  formatCents,
  type MessageKey,
  type MessageParams,
} from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { Card, LabelledValue } from '../components/Foundation';
import { gateMessage } from '../components/PaymentAvailability';
import {
  Body,
  Button,
  Notice,
  Screen,
  StatusBadge,
  useAccessibilityFocus,
  useAnnouncement,
} from '../components/ui';
import { authenticateLocally } from '../local-auth';
import type { RootStackParamList } from '../navigation';
import { describeOutcome, refusalText } from '../payment-outcome';
import { useControllerRevision, usePaymentServices } from '../payments/PaymentServices';

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;
type Message = { key: MessageKey; params?: MessageParams };

/** Only an action that may still need sending can be sent again; anything settled stays settled. */
const needsSending = (record: IntentRecord | undefined) =>
  record?.state === 'unknown' || record?.state === 'ready';

/**
 * The truthful state of one payment action. `applied` only means the server created the payment;
 * the words come from the payment's own status, so pending is never shown as paid, and an
 * unanswered request is "checking", never failed. Reachable again from Home after leaving or a
 * restart, because the action is saved on the device.
 */
export function ResultScreen({ route, navigation }: Props) {
  const { key } = route.params;
  const { t, locale } = useI18n();
  const { controller, services } = usePaymentServices();
  useControllerRevision(controller);
  const focused = useIsFocused();
  const focusedRef = useRef(focused);
  useEffect(() => {
    focusedRef.current = focused; // read after the prompt: has the user left this screen?
  }, [focused]);
  const authorizer = useRef(
    new PaymentAuthorizer(() => services?.session.user()?.id ?? null),
  ).current;
  const [busy, setBusy] = useState<'check' | 'send' | null>(null);
  const [message, setMessage] = useState<Message | null>(null);

  const record = controller?.get(key);
  const intent = record?.kind === 'payOrder' ? record : undefined;
  const outcome = intent ? describeOutcome(intent) : null;
  // Focus goes to the heading once, which reads the first outcome; later changes (checking →
  // paid) are announced instead, so the same words are never spoken twice.
  const headingRef = useAccessibilityFocus<Text>(outcome ? key : null);
  useAnnouncement(outcome ? t(outcome.title) : null, true);

  if (!controller) {
    return (
      <Screen>
        <Notice tone="neutral" title={t('home.loadingRecords')} />
      </Screen>
    );
  }
  if (!intent || !outcome) {
    return (
      <Screen>
        <Notice tone="neutral" title={t('result.gone')}>
          <Button label={t('home.history')} onPress={() => navigation.navigate('History')} />
        </Notice>
      </Screen>
    );
  }

  const display = paymentDisplay(intent);
  const amount = formatCents(intent.payload.amountCents, locale);
  const pollState = controller.pollState(key);
  const payment = intent.resource
    ? controller.cache.paymentView(intent.resource.paymentId)?.payment
    : undefined;

  async function checkAgain() {
    setBusy('check');
    setMessage(null);
    await controller?.checkAgain(key);
    setBusy(null);
  }

  /** The same request again (same key and body): it may create the payment, so it is authorized. */
  async function sendAgain() {
    if (!controller || !intent) return;
    const binding: PaymentBinding = {
      userId: intent.scope.userId,
      orderId: intent.payload.orderId,
      amountCents: intent.payload.amountCents,
      reviewId: 0,
    };
    setBusy('send');
    setMessage(null);
    const result = await authorizer.run({
      binding,
      authenticate: () =>
        authenticateLocally({
          prompt: t('auth.resendPrompt', { amount }),
          cancel: t('auth.cancel'),
        }),
      current: () => (focusedRef.current && needsSending(controller.get(key)) ? binding : null),
      send: () => controller.retry(key),
    });
    setBusy(null);
    if (result.type === 'not_authorized') setMessage({ key: `auth.${result.reason}` });
    else if (result.type === 'invalidated') setMessage({ key: 'result.sendInvalidated' });
    else if (result.type === 'done') {
      const retried = result.result;
      if (retried.type === 'blocked') setMessage(gateMessage(retried.gate));
      else if (retried.type === 'replay_not_allowed')
        setMessage({ key: `result.replay.${retried.reason}` });
      else if (retried.type === 'storage_failed') setMessage({ key: 'review.storageFailed' });
    }
  }

  function done() {
    if (isFinal(intent as IntentRecord)) void controller?.acknowledge(key);
    navigation.navigate('Home');
  }

  return (
    <Screen
      footer={
        <Button
          tone="secondary"
          label={t(isFinal(intent) ? 'result.done' : 'result.later')}
          onPress={done}
        />
      }
    >
      <Text ref={headingRef} accessibilityRole="header" className="text-2xl font-bold text-ink">
        {t(outcome.title)}
      </Text>
      <StatusBadge tone={outcome.tone} label={t(outcome.title)} />
      <Body>{t(outcome.body)}</Body>

      <Card>
        <LabelledValue label={t('payment.amount')} value={amount} />
        {payment ? (
          <>
            <LabelledValue
              label={t('payment.place')}
              value={`${payment.mensa.name} · ${payment.till.name}`}
            />
            <LabelledValue
              label={t('payment.createdAt')}
              value={`${formatBerlinDateTime(payment.createdAt, locale)} (${t('time.berlin')})`}
            />
          </>
        ) : null}
      </Card>

      {display === 'checking' && intent.refusal ? (
        <Notice tone="neutral" title={t('result.lastAnswer')}>
          <Body>{t(refusalText(intent.refusal))}</Body>
        </Notice>
      ) : null}

      {display === 'pending' || display === 'checking' ? (
        <Body muted>{t(`result.poll.${pollState}`)}</Body>
      ) : null}

      {display === 'pending' || display === 'checking' ? (
        <Button
          tone="secondary"
          label={t('result.checkAgain')}
          busy={busy === 'check'}
          disabled={busy === 'send'}
          onPress={() => void checkAgain()}
        />
      ) : null}
      {display === 'checking' || display === 'not_sent' ? (
        <Button
          label={t(display === 'checking' ? 'result.sendAgain' : 'result.sendNow')}
          hint={t('result.sendAgainHint')}
          busy={busy === 'send'}
          disabled={busy === 'check'}
          onPress={() => void sendAgain()}
        />
      ) : null}
      {display === 'declined' ? (
        <Button
          label={t('result.tryAgain')}
          onPress={() => navigation.navigate('Review', { orderId: intent.payload.orderId })}
        />
      ) : null}
      {payment ? (
        <Button
          tone="secondary"
          label={t('result.details')}
          onPress={() => navigation.navigate('PaymentDetail', { paymentId: payment.id })}
        />
      ) : null}

      {message ? (
        <Notice tone="warning" title={t(message.key, message.params)}>
          {message.key === 'auth.not_enrolled' ? <Body>{t('auth.enrollHelp')}</Body> : null}
        </Notice>
      ) : null}
    </Screen>
  );
}
