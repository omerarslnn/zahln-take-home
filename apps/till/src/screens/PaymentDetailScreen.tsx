import type { Payment } from '@mensa/api';
import { isFinal, type RefundIntent, type ServerTime } from '@mensa/domain';
import { formatCents, parseEuroAmount, type MessageKey } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Card, LabelledValue } from '../components/Foundation';
import { PaymentDetails } from '../components/PaymentDetails';
import { refundStatusText } from '../components/payment-text';
import {
  Body,
  Button,
  Notice,
  Screen,
  StatusBadge,
  useAnnouncement,
  type Tone,
} from '../components/ui';
import type { TillStackParamList } from '../navigation';
import {
  useControllerRevision,
  usePaymentServices,
  useServerNow,
} from '../payments/PaymentServices';
import { usePaymentDetail } from '../payments/usePaymentDetail';

type Props = NativeStackScreenProps<TillStackParamList, 'PaymentDetail'>;

/** "The payment must be confirmed and less than 30 days old" (POST …/refunds). */
const REFUND_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
/** `CreateRefund.reason` maxLength in the contract. */
const REASON_MAX = 200;

export function PaymentDetailScreen({ route }: Props) {
  const { t } = useI18n();
  const { paymentId } = route.params;
  const { view, loading, failure, reload } = usePaymentDetail(paymentId);

  return (
    <Screen>
      {failure ? (
        <Notice tone="error" title={t(`detail.failure.${failure}`)}>
          <Button label={t('common.retry')} busy={loading} onPress={() => void reload()} />
        </Notice>
      ) : null}
      {view ? (
        <>
          <PaymentDetails payment={view.payment} detail={view.detail} />
          <RefundPanel payment={view.payment} onChanged={() => void reload()} />
          <Button
            tone="secondary"
            label={t('detail.refresh')}
            busy={loading}
            onPress={() => void reload()}
          />
        </>
      ) : failure ? null : (
        <Notice tone="neutral" title={t('detail.loading')} />
      )}
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
  const { t, locale } = useI18n();
  const { controller } = usePaymentServices();
  useControllerRevision(controller);
  const now = useServerNow(10_000);
  const [amountText, setAmountText] = useState('');
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: Tone; key: MessageKey } | null>(null);

  const refunds = (controller?.list() ?? []).filter(
    (r): r is RefundIntent => r.kind === 'refundPayment' && r.payload.paymentId === payment.id,
  );
  const unresolved = refunds.find((r) => !isFinal(r));
  const lastFinal = refunds.filter((r) => isFinal(r)).at(-1);
  const blocked = refundBlock(payment, unresolved, now);
  const parsed = parseEuroAmount(amountText);
  const tooMuch = parsed.ok && parsed.cents > payment.refundableAmountCents;

  function fillRemaining() {
    const cents = payment.refundableAmountCents;
    const separator = locale === 'de' ? ',' : '.';
    setAmountText(`${Math.floor(cents / 100)}${separator}${String(cents % 100).padStart(2, '0')}`);
    setConfirming(null);
  }

  async function submit(cents: number) {
    if (!controller || busy) return;
    setBusy(true);
    setMessage(null);
    const outcome = await controller.refund(
      payment.id,
      cents,
      reason.trim() === '' ? null : reason.trim(),
      // After a known final refund, another one is a deliberate new action on what is left.
      lastFinal ? { afterFinalKey: lastFinal.key } : {},
    );
    setBusy(false);
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
    onChanged(); // the server's numbers moved (or were re-read): show the newest
  }

  return (
    <Card title={t('refund.title')}>
      <LabelledValue
        label={t('refund.available')}
        value={formatCents(payment.refundableAmountCents, locale)}
      />
      <Body muted>{t('refund.availableNote')}</Body>

      {refunds.map((record) => (
        <RefundRow key={record.key} record={record} />
      ))}

      {blocked ? (
        <Notice
          tone={blocked === 'refund.blocked.unresolved' ? 'warning' : 'neutral'}
          title={t(blocked)}
        />
      ) : confirming !== null ? (
        <Notice
          tone="warning"
          title={t('refund.confirmTitle', { amount: formatCents(confirming, locale) })}
        >
          <Body>{t('refund.confirmBody')}</Body>
          <Button
            tone="danger"
            label={t('refund.confirm', { amount: formatCents(confirming, locale) })}
            busy={busy}
            onPress={() => void submit(confirming)}
          />
          <Button
            tone="secondary"
            label={t('refund.cancel')}
            disabled={busy}
            onPress={() => setConfirming(null)}
          />
        </Notice>
      ) : (
        <View className="gap-3">
          <Button
            tone="secondary"
            label={t('refund.fillRemaining', {
              amount: formatCents(payment.refundableAmountCents, locale),
            })}
            onPress={fillRemaining}
          />
          <Text className="text-base text-ink">{t('refund.amountLabel')}</Text>
          <TextInput
            value={amountText}
            onChangeText={(text) => {
              setAmountText(text);
              setMessage(null);
            }}
            keyboardType="decimal-pad"
            accessibilityLabel={t('refund.amountLabel')}
            placeholder={locale === 'de' ? '2,50' : '2.50'}
            className="min-h-touch rounded-control border-2 border-line bg-surface px-3 text-lg text-ink"
          />
          {amountText !== '' && !parsed.ok ? (
            <Text accessibilityLiveRegion="polite" className="text-base font-semibold text-danger">
              {t(`refund.amount.${parsed.reason}`)}
            </Text>
          ) : tooMuch ? (
            <Text accessibilityLiveRegion="polite" className="text-base font-semibold text-danger">
              {t('refund.amount.tooMuch', {
                amount: formatCents(payment.refundableAmountCents, locale),
              })}
            </Text>
          ) : null}
          <Text className="text-base text-ink">{t('refund.reasonLabel')}</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            maxLength={REASON_MAX}
            accessibilityLabel={t('refund.reasonLabel')}
            className="min-h-touch rounded-control border-2 border-line bg-surface px-3 text-base text-ink"
          />
          <Body muted>{t('refund.reasonCount', { count: reason.length, max: REASON_MAX })}</Body>
          <Button
            label={t('refund.review')}
            disabled={!parsed.ok || tooMuch}
            onPress={() => parsed.ok && setConfirming(parsed.cents)}
          />
        </View>
      )}
      {message ? <Notice tone={message.tone} title={t(message.key)} /> : null}
    </Card>
  );
}

/** One refund action: the client's request state, then the server's refund status. */
function RefundRow({ record }: { record: RefundIntent }) {
  const { t, locale } = useI18n();
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
    <View className="gap-2 border-t border-line pt-3">
      <StatusBadge tone={status.tone} label={t(status.key)} />
      <Text className="text-base text-ink">{formatCents(record.payload.amountCents, locale)}</Text>
      {record.state === 'unknown' ? (
        <>
          <Body>{t('refund.unknownBody')}</Body>
          <Button label={t('checkout.sendAgain')} busy={busy} onPress={() => void sendAgain()} />
        </>
      ) : null}
      {record.state === 'ready' ? (
        <Button label={t('checkout.sendAgain')} busy={busy} onPress={() => void sendAgain()} />
      ) : null}
      {record.refusal && record.state !== 'applied' ? (
        <Body muted>{t(refundRefusal(record.refusal))}</Body>
      ) : null}
      {isFinal(record) ? (
        <Button
          tone="secondary"
          label={t('refund.dismiss')}
          onPress={() => void controller?.acknowledge(record.key)}
        />
      ) : null}
      {message ? <Notice tone="warning" title={t(message)} /> : null}
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
