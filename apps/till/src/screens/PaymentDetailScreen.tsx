import type { Payment, PaymentDetail } from '@mensa/api';
import { isFinal, type RefundIntent, type ServerTime } from '@mensa/domain';
import { formatCents, type MessageKey } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useRef, useState, type ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { refundStatusText } from '../components/payment-text';
import {
  DetailLoading,
  ItemsCard,
  PaymentHero,
  RefundsCard,
  TimelineCard,
} from '../components/PaymentSummary';
import {
  AmountText,
  Body,
  Button,
  Caption,
  Card,
  Notice,
  Screen,
  StatusPill,
  TextField,
  useAnnouncement,
  type Tone,
} from '../components/ui';
import type { TillStackParamList } from '../navigation';
import {
  useControllerRevision,
  usePaymentServices,
  useServerNow,
} from '../payments/PaymentServices';
import { usePaymentDetail, type DetailFailure } from '../payments/usePaymentDetail';
import { checkRefundAmount, refundInputText } from '../till-rules';

type Props = NativeStackScreenProps<TillStackParamList, 'PaymentDetail'>;

/** "The payment must be confirmed and less than 30 days old" (POST …/refunds). */
const REFUND_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
/** `CreateRefund.reason` maxLength in the contract. */
const REASON_MAX = 200;

export function PaymentDetailScreen({ route }: Props) {
  const { paymentId } = route.params;
  const { view, loading, failure, reload } = usePaymentDetail(paymentId);
  return (
    <TillPaymentDetailView
      payment={view?.payment ?? null}
      detail={view?.detail ?? null}
      loading={loading}
      failure={failure}
      onReload={() => void reload()}
      refundPanel={
        view ? <RefundPanel payment={view.payment} onChanged={() => void reload()} /> : null
      }
    />
  );
}

/**
 * One payment of this till with everything the cashier needs to refund it: on a tablet the payment
 * (status and amount, who paid, the server's refunds, items, history) on the left and the refund
 * panel on the right; on a phone the refund panel follows the payment's summary.
 */
export function TillPaymentDetailView(props: {
  payment: Payment | null;
  detail: PaymentDetail | null;
  loading: boolean;
  failure: DetailFailure | null;
  onReload: () => void;
  refundPanel: ReactNode | null;
}) {
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const wide = width >= 768;
  const { payment, detail } = props;
  const failure = props.failure ? (
    <Notice
      tone="error"
      title={t(`detail.failure.${props.failure}`)}
      actions={<Button label={t('common.retry')} busy={props.loading} onPress={props.onReload} />}
    />
  ) : null;
  if (!payment) {
    return <Screen>{failure ?? <DetailLoading />}</Screen>;
  }
  const refresh = (
    <Button
      tone="tertiary"
      icon="refresh-outline"
      label={t('detail.refresh')}
      busy={props.loading}
      onPress={props.onReload}
    />
  );
  const summary = (
    <>
      <PaymentHero payment={payment} payer />
      <RefundsCard payment={payment} detail={detail} />
      <ItemsCard payment={payment} />
      <TimelineCard detail={detail} />
    </>
  );
  if (!wide) {
    return (
      <Screen>
        {failure}
        <PaymentHero payment={payment} payer />
        {props.refundPanel}
        <RefundsCard payment={payment} detail={detail} />
        <ItemsCard payment={payment} />
        <TimelineCard detail={detail} />
        {refresh}
      </Screen>
    );
  }
  return (
    <Screen>
      {failure}
      <View className="flex-row items-start gap-4">
        <View className="flex-[3] gap-4" collapsable={false} importantForAccessibility="yes">
          {summary}
          {refresh}
        </View>
        <View className="flex-[2] gap-4" collapsable={false} importantForAccessibility="yes">
          {props.refundPanel}
        </View>
      </View>
    </Screen>
  );
}

/** Why a new refund cannot start now, in the order a cashier can act on it. The server decides. */
function refundBlock(
  payment: Payment,
  unresolved: RefundIntent | undefined,
  now: ServerTime | null,
): MessageKey | null {
  // An answered refund still being processed, or one whose answer was lost: different words,
  // the same rule (one refund action per payment at a time).
  if (unresolved)
    return unresolved.state === 'applied' ? 'refund.blocked.pending' : 'refund.blocked.unresolved';
  if (payment.status !== 'confirmed') return 'refund.blocked.notConfirmed';
  if (now && now.earliest - Date.parse(payment.createdAt) >= REFUND_WINDOW_MS) {
    return 'refund.blocked.tooOld';
  }
  if (payment.refundableAmountCents <= 0) return 'refund.blocked.nothingLeft';
  return null;
}

/**
 * Full and partial refunds. Capacity is the server's `refundableAmountCents`, which already reserves
 * pending refunds; the controller reads it again right before sending. One refund intent per payment
 * at a time: while one is unresolved (its answer was lost), no other starts, because it could be a
 * second refund of the same money. Nothing dismisses an unresolved refund.
 */
function RefundPanel({ payment, onChanged }: { payment: Payment; onChanged: () => void }) {
  const { locale } = useI18n();
  const { controller } = usePaymentServices();
  useControllerRevision(controller);
  const now = useServerNow(10_000);
  const [amountText, setAmountText] = useState('');
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // Answers a second tap on "Refund" before React has re-rendered the busy button; the controller
  // refuses a second refund action for this payment as well.
  const submittingNow = useRef(false);
  const [message, setMessage] = useState<{ tone: Tone; key: MessageKey } | null>(null);

  const refunds = (controller?.list() ?? []).filter(
    (r): r is RefundIntent => r.kind === 'refundPayment' && r.payload.paymentId === payment.id,
  );
  const unresolved = refunds.find((r) => !isFinal(r));
  const lastFinal = refunds.filter((r) => isFinal(r)).at(-1);
  const blocked = refundBlock(payment, unresolved, now);
  const amount = checkRefundAmount(amountText, payment.refundableAmountCents);
  // A reviewed amount stays confirmable only while the server's newest remainder still covers it:
  // if a refresh lowers it, the confirmation gives way to the form, whose error names the new limit.
  const confirmable =
    confirming !== null && confirming <= payment.refundableAmountCents ? confirming : null;

  async function submit(cents: number) {
    if (!controller || submittingNow.current) return;
    submittingNow.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const outcome = await controller.refund(
        payment.id,
        cents,
        reason.trim() === '' ? null : reason.trim(),
        // After a known final refund, another one is a deliberate new action on what is left.
        lastFinal ? { afterFinalKey: lastFinal.key } : {},
      );
      setConfirming(null);
      if (outcome.type === 'submitted' || outcome.type === 'existing') {
        setAmountText('');
        setReason('');
      } else if (outcome.type === 'conflict') {
        setMessage({
          tone: 'warning',
          key: refundBlock(payment, unresolved, now) ?? 'refund.blocked.unresolved',
        });
      } else if (outcome.type === 'not_allowed') {
        setMessage({ tone: 'error', key: `refund.notAllowed.${outcome.reason}` });
      } else if (outcome.type === 'storage_failed') {
        setMessage({ tone: 'error', key: 'checkout.storageFailed' });
      }
    } finally {
      submittingNow.current = false;
      setBusy(false);
    }
    onChanged(); // the server's numbers moved (or were re-read): show the newest
  }

  return (
    <RefundPanelView
      refundableCents={payment.refundableAmountCents}
      payer={payment.payer.displayName}
      blocked={blocked}
      rows={refunds.map((record) => (
        <RefundRow key={record.key} record={record} />
      ))}
      amountText={amountText}
      reason={reason}
      amount={amount}
      confirming={confirmable}
      busy={busy}
      message={message}
      onAmountChange={(text) => {
        setAmountText(text);
        setMessage(null);
      }}
      onReasonChange={setReason}
      onFillRemaining={() => {
        setAmountText(refundInputText(payment.refundableAmountCents, locale));
        setConfirming(null);
      }}
      onReview={() => amount.ok && setConfirming(amount.cents)}
      onConfirm={() => confirmable !== null && void submit(confirmable)}
      onCancel={() => setConfirming(null)}
    />
  );
}

export interface RefundPanelViewProps {
  refundableCents: number;
  payer: string;
  /** Why no new refund can start; the form is then replaced by this notice. */
  blocked: MessageKey | null;
  /** This device's refund actions for the payment, newest last. */
  rows: ReactNode[];
  amountText: string;
  reason: string;
  amount: ReturnType<typeof checkRefundAmount>;
  /** The amount being confirmed (the second step), or null on the form. */
  confirming: number | null;
  busy: boolean;
  message: { tone: Tone; key: MessageKey } | null;
  onAmountChange: (text: string) => void;
  onReasonChange: (text: string) => void;
  onFillRemaining: () => void;
  onReview: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The refund panel: the server's refundable amount as the hero, this device's refund actions,
 * then either why nothing can be refunded now, the form (amount, optional reason), or the
 * confirmation that names the amount and the payer. Refunding is always two steps.
 */
export function RefundPanelView(props: RefundPanelViewProps) {
  const { t, locale } = useI18n();
  const refundable = formatCents(props.refundableCents, locale);
  const amountError = props.amount.ok
    ? null
    : props.amount.error === null
      ? null
      : props.amount.error.key === 'tooMuch'
        ? t('refund.amount.tooMuch', { amount: formatCents(props.refundableCents, locale) })
        : t(`refund.amount.${props.amount.error.key}`);

  return (
    <Card title={t('refund.title')}>
      <View accessible accessibilityLabel={`${t('refund.available')}: ${refundable}`}>
        <Caption>{t('refund.available')}</Caption>
        <AmountText cents={props.refundableCents} size="title" />
      </View>
      <Caption>{t('refund.availableNote')}</Caption>

      {props.rows}

      {props.blocked ? (
        <Notice
          tone={props.blocked === 'refund.blocked.unresolved' ? 'warning' : 'neutral'}
          title={t(props.blocked)}
        />
      ) : props.confirming !== null ? (
        <Notice
          tone="warning"
          title={t('refund.confirmTo', {
            amount: formatCents(props.confirming, locale),
            payer: props.payer,
          })}
          description={t('refund.confirmBody')}
          actions={
            <>
              <Button
                tone="danger"
                icon="return-down-back"
                label={t('refund.confirm', { amount: formatCents(props.confirming, locale) })}
                busy={props.busy}
                onPress={props.onConfirm}
              />
              <Button
                tone="secondary"
                label={t('refund.cancel')}
                disabled={props.busy}
                onPress={props.onCancel}
              />
            </>
          }
        />
      ) : (
        <View className="gap-4">
          <Button
            tone="secondary"
            label={t('refund.fillRemaining', { amount: refundable })}
            onPress={props.onFillRemaining}
          />
          <TextField
            label={t('refund.amountLabel')}
            hint={t('refund.amountHint', { example: locale === 'de' ? '2,50' : '2.50' })}
            value={props.amountText}
            onChangeText={props.onAmountChange}
            error={amountError}
            keyboardType="decimal-pad"
            returnKeyType="done"
            placeholder={locale === 'de' ? '2,50' : '2.50'}
          />
          <TextField
            label={t('refund.reasonLabel')}
            hint={t('refund.reasonCount', { count: props.reason.length, max: REASON_MAX })}
            value={props.reason}
            onChangeText={props.onReasonChange}
            maxLength={REASON_MAX}
            returnKeyType="done"
          />
          <Button label={t('refund.review')} disabled={!props.amount.ok} onPress={props.onReview} />
        </View>
      )}
      {props.message ? <Notice tone={props.message.tone} title={t(props.message.key)} /> : null}
    </Card>
  );
}

/** One refund action: the client's request state, then the server's refund status. */
function RefundRow({ record }: { record: RefundIntent }) {
  const { t } = useI18n();
  const { controller } = usePaymentServices();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<MessageKey | null>(null);
  const status = refundState(record);
  useAnnouncement(t(status.key), true);

  async function sendAgain() {
    setBusy(true);
    setMessage(null);
    const outcome = await controller?.retry(record.key);
    setBusy(false);
    if (outcome?.type === 'replay_not_allowed') setMessage(`checkout.replay.${outcome.reason}`);
    if (outcome?.type === 'storage_failed') setMessage('checkout.storageFailed');
  }

  return (
    <RefundRowView
      status={status}
      amountCents={record.payload.amountCents}
      state={record.state}
      refusal={record.refusal && record.state !== 'applied' ? refundRefusal(record.refusal) : null}
      final={isFinal(record)}
      busy={busy}
      message={message}
      onSendAgain={() => void sendAgain()}
      onDismiss={() => void controller?.acknowledge(record.key)}
    />
  );
}

export function RefundRowView(props: {
  status: { tone: Tone; key: MessageKey };
  amountCents: number;
  state: RefundIntent['state'];
  refusal: MessageKey | null;
  final: boolean;
  busy: boolean;
  message: MessageKey | null;
  onSendAgain: () => void;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  const resendable = props.state === 'unknown' || props.state === 'ready';
  return (
    <View className="gap-3 border-t border-line-subtle pt-3">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <StatusPill tone={props.status.tone} label={t(props.status.key)} />
        <AmountText cents={props.amountCents} />
      </View>
      {props.state === 'unknown' ? <Body>{t('refund.unknownBody')}</Body> : null}
      {props.refusal ? <Caption>{t(props.refusal)}</Caption> : null}
      {resendable ? (
        <Button
          icon="shield-checkmark-outline"
          label={t('checkout.sendAgain')}
          busy={props.busy}
          onPress={props.onSendAgain}
        />
      ) : null}
      {props.final ? (
        <Button tone="tertiary" label={t('refund.dismiss')} onPress={props.onDismiss} />
      ) : null}
      {props.message ? <Notice tone="warning" title={t(props.message)} /> : null}
    </View>
  );
}

function refundState(record: RefundIntent): { tone: Tone; key: MessageKey } {
  switch (record.state) {
    case 'ready':
      return { tone: 'neutral', key: 'refund.state.notSent' };
    case 'submitting':
      return { tone: 'pending', key: 'refund.state.sending' };
    case 'unknown':
      return { tone: 'warning', key: 'refund.state.checking' };
    case 'rejected':
      return { tone: 'error', key: 'refund.state.refused' };
    case 'applied':
      return record.resource
        ? refundStatusText(record.resource.status)
        : { tone: 'pending', key: 'status.refund.pending' };
  }
}

function refundRefusal(code: string): MessageKey {
  switch (code) {
    case 'refund_exceeds_payment':
      return 'refund.notAllowed.exceeds_refundable';
    case 'payment_not_refundable':
      return 'refund.notAllowed.payment_not_refundable';
    case 'refund_window_closed':
      return 'refund.blocked.tooOld';
    case 'forbidden':
      return 'refund.forbidden';
    default:
      return 'refusal.other';
  }
}
