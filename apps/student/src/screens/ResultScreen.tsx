import {
  isFinal,
  paymentDisplay,
  PaymentAuthorizer,
  type GateState,
  type IntentRecord,
  type PaymentBinding,
  type PaymentDisplay,
  type PollState,
} from '@mensa/domain';
import { colors, formatBerlinDateTime, formatCents, type MessageKey } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState, type Ref } from 'react';
import { Text, View } from 'react-native';
import { gateAnnouncement, paymentsOpen } from '../availability';
import { OutcomeHero } from '../components/OutcomeHero';
import { AvailabilityNotice } from '../components/PaymentAvailability';
import {
  Button,
  Caption,
  Card,
  Icon,
  LabelledValue,
  Notice,
  Screen,
  useAccessibilityFocus,
  useAnnouncement,
} from '../components/ui';
import { authenticateLocally } from '../local-auth';
import type { RootStackParamList } from '../navigation';
import { afterResend, describeOutcome, refusalText, type OutcomeText } from '../payment-outcome';
import {
  useControllerRevision,
  usePaymentGate,
  usePaymentServices,
} from '../payments/PaymentServices';
import { outcomeVisual } from '../result-visual';

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;

/** Only an action that may still need sending can be sent again; anything settled stays settled. */
const needsSending = (record: IntentRecord | undefined) =>
  record?.state === 'unknown' || record?.state === 'ready';

/**
 * The truthful state of one payment action. `applied` only means the server created the payment;
 * the words come from the payment's own status, so pending is never shown as paid, and an
 * unanswered request is "checking", never failed. Reachable again from Home after leaving or a
 * restart, because the action is saved on the device. This container owns the rules (checking,
 * the authorized resend, dismissing); `ResultView` only renders.
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
  // Never a copy of the gate's state: the availability notice reads the live gate.
  const [message, setMessage] = useState<MessageKey | null>(null);
  const gate = usePaymentGate();

  const record = controller?.get(key);
  const intent = record?.kind === 'payOrder' ? record : undefined;
  const outcome = intent ? describeOutcome(intent) : null;
  const display = intent ? paymentDisplay(intent) : null;
  // Sending again is a payment request too, so it waits for the gate like a new payment.
  const resendable = display === 'checking' || display === 'not_sent';
  // Focus goes to the heading once, which reads the first outcome; later changes (checking →
  // paid) are announced instead, so the same words are never spoken twice.
  const headingRef = useAccessibilityFocus<Text>(outcome ? key : null);
  useAnnouncement(outcome ? t(outcome.title) : null, true);
  useAnnouncement(resendable ? gateAnnouncement(gate, t) : null, true);

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
        <Notice
          tone="neutral"
          title={t('result.gone')}
          actions={
            <Button label={t('home.history')} onPress={() => navigation.navigate('History')} />
          }
        />
      </Screen>
    );
  }

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
    setMessage(afterResend(result));
  }

  function done() {
    if (isFinal(intent as IntentRecord)) void controller?.acknowledge(key);
    navigation.navigate('Home');
  }

  return (
    <ResultView
      outcome={outcome}
      display={paymentDisplay(intent)}
      amountCents={intent.payload.amountCents}
      refusal={intent.refusal}
      pollState={pollState}
      payment={
        payment
          ? {
              place: `${payment.mensa.name} · ${payment.till.name}`,
              createdAt: payment.createdAt,
            }
          : null
      }
      gate={gate}
      final={isFinal(intent)}
      busy={busy}
      message={message}
      headingRef={headingRef}
      onCheckAgain={() => void checkAgain()}
      onSendAgain={() => void sendAgain()}
      onTryAgain={() => navigation.navigate('Review', { orderId: intent.payload.orderId })}
      onDetails={
        payment ? () => navigation.navigate('PaymentDetail', { paymentId: payment.id }) : null
      }
      onDone={done}
    />
  );
}

export interface ResultViewProps {
  outcome: OutcomeText;
  display: PaymentDisplay;
  /** The amount the payer confirmed: the server's amount for the reviewed order. */
  amountCents: number;
  /** The server's last refusal code, shown while the outcome is still unknown. */
  refusal: string | null;
  pollState: PollState;
  /** Known once the server has answered with the payment. */
  payment: { place: string; createdAt: string } | null;
  gate: GateState | null;
  /** A known final result: the footer says "Done" and dismisses it. */
  final: boolean;
  busy: 'check' | 'send' | null;
  message: MessageKey | null;
  headingRef?: Ref<Text>;
  onCheckAgain: () => void;
  onSendAgain: () => void;
  onTryAgain: () => void;
  onDetails: (() => void) | null;
  onDone: () => void;
}

/**
 * The result: a hero with the state's icon, words and the amount, then only the actions that state
 * allows. Not known yet: check again and send again safely (which waits for availability). Being
 * checked: check again. Declined: try again with a new confirmation. Paid: the details.
 */
export function ResultView({ headingRef, ...props }: ResultViewProps) {
  const { t, locale } = useI18n();
  const { display, outcome } = props;
  const visual = outcomeVisual(display, outcome.tone);
  const resendable = display === 'checking' || display === 'not_sent';
  const checking = display === 'pending' || display === 'checking';
  return (
    <Screen
      footer={
        <Button
          tone="secondary"
          label={t(props.final ? 'result.done' : 'result.later')}
          onPress={props.onDone}
        />
      }
    >
      <OutcomeHero
        tone={outcome.tone}
        icon={visual.icon}
        celebrate={visual.celebrate}
        title={t(outcome.title)}
        body={t(outcome.body)}
        amountCents={props.amountCents}
        headingRef={headingRef}
      />

      {display === 'checking' && props.refusal ? (
        <Notice
          tone="neutral"
          title={t('result.lastAnswer')}
          description={t(refusalText(props.refusal))}
        />
      ) : null}

      {checking ? (
        <View className="flex-row items-center justify-center gap-2">
          <Icon
            name={props.pollState === 'polling' ? 'sync-outline' : 'pause-circle-outline'}
            size="sm"
            color={colors.inkMuted}
          />
          <Caption>{t(`result.poll.${props.pollState}`)}</Caption>
        </View>
      ) : null}

      {checking ? (
        <Button
          tone="secondary"
          icon="refresh-outline"
          label={t('result.checkAgain')}
          busy={props.busy === 'check'}
          disabled={props.busy === 'send'}
          onPress={props.onCheckAgain}
        />
      ) : null}
      {resendable ? (
        <AvailabilityNotice gate={props.gate} detail={t('result.resendWaits')} />
      ) : null}
      {resendable ? (
        <Button
          icon="shield-checkmark-outline"
          label={t(display === 'checking' ? 'result.sendAgain' : 'result.sendNow')}
          hint={t('result.sendAgainHint')}
          busy={props.busy === 'send'}
          disabled={props.busy === 'check' || !paymentsOpen(props.gate)}
          onPress={props.onSendAgain}
        />
      ) : null}
      {display === 'declined' ? (
        <Button label={t('result.tryAgain')} onPress={props.onTryAgain} />
      ) : null}

      {props.payment ? (
        <Card>
          <LabelledValue label={t('payment.place')} value={props.payment.place} />
          <LabelledValue
            label={t('payment.createdAt')}
            value={`${formatBerlinDateTime(props.payment.createdAt, locale)} (${t('time.berlin')})`}
          />
          {props.onDetails ? (
            <Button
              tone="tertiary"
              icon="receipt-outline"
              label={t('result.details')}
              onPress={props.onDetails}
            />
          ) : null}
        </Card>
      ) : null}

      {props.message ? (
        <Notice
          tone="warning"
          title={t(props.message)}
          description={props.message === 'auth.not_enrolled' ? t('auth.enrollHelp') : undefined}
        />
      ) : null}
    </Screen>
  );
}
