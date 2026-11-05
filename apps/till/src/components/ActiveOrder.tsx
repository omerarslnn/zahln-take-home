// The order being taken once it exists: its QR while it can be paid, then the server's result.
// The checkout screen shows this instead of the menu until "Next customer".
import type { Order } from '@mensa/api';
import { canCloseUnshownOrder, expiryState, isFinal, type CreateOrderIntent } from '@mensa/domain';
import { formatCents, type MessageKey } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { usePaymentServices, useServerNow } from '../payments/PaymentServices';
import { usePaymentDetail } from '../payments/usePaymentDetail';
import { OrderQr } from './OrderQr';
import { orderStatusText, priceGroupKey } from './payment-text';
import { Body, Button, Card, Notice, StatusPill, useAnnouncement } from './ui';

/** The order being taken: its QR while it can be paid, then the server's result. */
export function CheckoutPanel({ record, qrSize }: { record: CreateOrderIntent; qrSize: number }) {
  const { t } = useI18n();
  const { controller } = usePaymentServices();
  const now = useServerNow();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<MessageKey | null>(null);
  const order = record.resource ? controller?.cache.order(record.resource.orderId) : undefined;
  // After a restart the cache is empty, and a paid or expired order is no longer polled: read it
  // once so the panel shows the order instead of waiting. Reads never send anything.
  const missing = record.state === 'applied' && !order;
  useEffect(() => {
    if (missing) void controller?.reconcile(record.key);
  }, [missing, controller, record.key]);
  const status = order?.status ?? record.resource?.status;
  useAnnouncement(status ? t(orderStatusText(status).key) : null, true);

  if (!controller) return null;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setMessage(null);
    await action();
    setBusy(false);
  }

  async function sendAgain() {
    const outcome = await controller?.retry(record.key);
    if (outcome?.type === 'replay_not_allowed') setMessage(`checkout.replay.${outcome.reason}`);
    if (outcome?.type === 'storage_failed') setMessage('checkout.storageFailed');
  }

  if (record.state === 'submitting') {
    return <Notice tone="pending" title={t('checkout.creating')} />;
  }

  if (record.state !== 'applied') {
    // The create request has no answer (unknown) or was refused; no QR was ever shown.
    const closable = canCloseUnshownOrder(record, now);
    return (
      <Card title={t(`checkout.unresolved.${record.state}`)}>
        <Body>{t(`checkout.unresolved.${record.state}Body`)}</Body>
        {record.state !== 'rejected' ? (
          <Button label={t('checkout.sendAgain')} busy={busy} onPress={() => void run(sendAgain)} />
        ) : null}
        {record.state === 'rejected' ? (
          <Button
            label={t('checkout.startOver')}
            onPress={() => void controller.acknowledge(record.key)}
          />
        ) : (
          <Button
            tone="secondary"
            label={t('checkout.close')}
            disabled={!closable || busy}
            onPress={() => void run(() => controller.closeUnshownOrder(record.key))}
          />
        )}
        {record.state === 'unknown' && !closable ? (
          <Body muted>{t('checkout.closeLater')}</Body>
        ) : null}
        {message ? <Notice tone="warning" title={t(message)} /> : null}
      </Card>
    );
  }

  if (!order || !status) {
    return (
      <Notice
        tone="neutral"
        title={t('checkout.loadingOrder')}
        actions={
          <Button
            tone="secondary"
            label={t('result.checkAgain')}
            busy={busy}
            onPress={() => void run(() => controller.checkAgain(record.key))}
          />
        }
      />
    );
  }

  const text = orderStatusText(status);
  const expiry = expiryState(Date.parse(order.expiresAt), now);
  const secondsLeft = now
    ? Math.max(0, Math.floor((Date.parse(order.expiresAt) - now.latest) / 1000))
    : null;
  const pollState = controller.pollState(record.key);

  return (
    <Card>
      <StatusPill tone={text.tone} label={t(text.key)} />
      {status === 'open' || status === 'paying' ? (
        <>
          <View className="items-center gap-2">
            <OrderQr payload={order.qrPayload} size={qrSize} label={t('checkout.qrLabel')} />
            <Text selectable className="text-base text-ink-muted">
              {t('checkout.code', { code: order.id })}
            </Text>
          </View>
          <Body>{t(status === 'paying' ? 'checkout.payingBody' : 'checkout.openBody')}</Body>
          {status === 'open' ? (
            <Body muted>
              {expiry === 'expired'
                ? t('review.expired')
                : secondsLeft === null || expiry === 'uncertain'
                  ? t('review.timeUnknown')
                  : t('review.expiresIn', {
                      time: `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`,
                    })}
            </Body>
          ) : null}
          <GroupTotals order={order} />
          {pollState === 'stopped' ? (
            <Button
              tone="secondary"
              label={t('result.checkAgain')}
              busy={busy}
              onPress={() => void run(() => controller.checkAgain(record.key))}
            />
          ) : null}
        </>
      ) : null}
      {status === 'paid' && order.paymentId ? <PaidResult paymentId={order.paymentId} /> : null}
      {status === 'expired' ? <Body>{t('checkout.expiredBody')}</Body> : null}
      {isFinal(record) ? (
        <Button
          label={t('checkout.next')}
          onPress={() => void controller.acknowledge(record.key)}
          accessibilityLabel={t('checkout.next')}
        />
      ) : null}
    </Card>
  );
}

/** The server's total for each price group (cashier view); the payer's group decides which applies. */
function GroupTotals({ order }: { order: Order }) {
  const { t, locale } = useI18n();
  if (!order.amounts) return null;
  const amounts = order.amounts;
  return (
    <View accessible className="gap-1">
      <Text className="text-base text-ink-muted">{t('checkout.serverTotals')}</Text>
      <Text className="text-base text-ink">
        {(['student', 'staff', 'guest'] as const)
          .map((group) => `${t(priceGroupKey(group))} ${formatCents(amounts[group], locale)}`)
          .join(' · ')}
      </Text>
    </View>
  );
}

/** What the payer actually paid, from the payment itself (amount and price group). */
function PaidResult({ paymentId }: { paymentId: string }) {
  const { t, locale } = useI18n();
  const { view, failure } = usePaymentDetail(paymentId);
  const payment = view?.payment;
  if (!payment) {
    return <Body muted>{t(failure ? 'checkout.paidAmountUnknown' : 'detail.loading')}</Body>;
  }
  return (
    <View accessible className="gap-1">
      <Text className="text-3xl font-bold text-ink">
        {formatCents(payment.amountCents, locale)}
      </Text>
      <Body>{t('checkout.paidAs', { group: t(priceGroupKey(payment.priceGroup)) })}</Body>
    </View>
  );
}
