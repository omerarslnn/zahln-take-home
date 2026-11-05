// The order being taken once it exists: its QR while it can be paid, then the server's result.
// The checkout screen shows this instead of the menu until "Next customer". `ActiveOrder` keeps the
// rules (reading after a restart, sending again safely, closing an order that was never shown,
// keeping the screen on); `ActiveOrderView` only renders.
import type { Order, PriceGroup } from '@mensa/api';
import {
  canCloseUnshownOrder,
  expiryState,
  isFinal,
  type CreateOrderIntent,
  type ExpiryState,
} from '@mensa/domain';
import { formatCents, type MessageKey } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import { useIsFocused } from '@react-navigation/native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect, useState } from 'react';
import { Platform, Text, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import { countdownText } from '../order-countdown';
import { usePaymentServices, useServerNow } from '../payments/PaymentServices';
import { usePaymentDetail } from '../payments/usePaymentDetail';
import { keepAwakeWanted, qrSide } from '../till-rules';
import { OrderQr } from './OrderQr';
import { orderStatusText, priceGroupKey } from './payment-text';
import {
  AmountText,
  Body,
  Button,
  Caption,
  Card,
  Heading,
  Icon,
  LoadingIndicator,
  Notice,
  Tag,
  TONE,
  tabularFigures,
  useAnnouncement,
  useAppActive,
  type IconName,
  type Tone,
} from './ui';

const KEEP_AWAKE_TAG = 'till-order-qr';
const MONOSPACE = Platform.select({ ios: 'Menlo', default: 'monospace' });

interface ActiveOrderActions {
  onSendAgain: () => void;
  onClose: () => void;
  onStartOver: () => void;
  onCheckAgain: () => void;
  onNext: () => void;
}

/** The order intent's panel: its rules, then `ActiveOrderView`. */
export function ActiveOrder({ record, wide }: { record: CreateOrderIntent; wide: boolean }) {
  const { t } = useI18n();
  const { controller } = usePaymentServices();
  const focused = useIsFocused();
  const appActive = useAppActive();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<MessageKey | null>(null);
  const order = record.resource ? controller?.cache.order(record.resource.orderId) : undefined;
  // After a restart the cache is empty, and a paid or expired order is no longer polled: read it
  // once so the panel shows the order instead of waiting. Reads never send anything.
  const missing = record.state === 'applied' && !order;
  useEffect(() => {
    if (missing) void controller?.reconcile(record.key);
  }, [missing, controller, record.key]);
  const status = order?.status ?? record.resource?.status ?? null;
  useAnnouncement(status ? t(orderStatusText(status).key) : null, true);

  // The screen stays on only while a payer may still scan this code, in front, in the foreground;
  // it is released as soon as that stops, and when this panel goes away.
  const awake = keepAwakeWanted({ focused, appActive, status });
  useEffect(() => {
    if (!awake) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    return () => void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
  }, [awake]);

  if (!controller) return null;
  const control = controller;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setMessage(null);
    await action();
    setBusy(false);
  }

  async function sendAgain() {
    const outcome = await control.retry(record.key);
    if (outcome.type === 'replay_not_allowed') setMessage(`checkout.replay.${outcome.reason}`);
    if (outcome.type === 'storage_failed') setMessage('checkout.storageFailed');
  }

  const actions: ActiveOrderActions = {
    onSendAgain: () => void run(sendAgain),
    onClose: () => void run(() => control.closeUnshownOrder(record.key)),
    onStartOver: () => void control.acknowledge(record.key),
    onCheckAgain: () => void run(() => control.checkAgain(record.key)),
    onNext: () => void control.acknowledge(record.key),
  };

  if (record.state === 'submitting') return <ActiveOrderView phase="creating" {...actions} />;
  if (record.state !== 'applied') {
    // The create request has no answer (unknown) or was refused; no QR was ever shown.
    return <UnresolvedOrder record={record} busy={busy} message={message} actions={actions} />;
  }
  if (!order || !status) return <ActiveOrderView phase="loading" busy={busy} {...actions} />;
  return (
    <ActiveOrderView
      phase="order"
      wide={wide}
      order={order}
      pollStopped={control.pollState(record.key) === 'stopped'}
      final={isFinal(record)}
      busy={busy}
      {...actions}
    />
  );
}

/** Whether "Close this order" is possible needs server time, so only this card re-renders on it. */
function UnresolvedOrder(props: {
  record: CreateOrderIntent;
  busy: boolean;
  message: MessageKey | null;
  actions: ActiveOrderActions;
}) {
  const now = useServerNow();
  return (
    <ActiveOrderView
      phase="unresolved"
      state={props.record.state as 'unknown' | 'ready' | 'rejected'}
      closable={canCloseUnshownOrder(props.record, now)}
      busy={props.busy}
      message={props.message}
      {...props.actions}
    />
  );
}

/** What the payer paid; given in previews, otherwise read from the payment. */
export type PaidInfo = { amountCents: number; priceGroup: PriceGroup } | 'loading' | 'unknown';

export type ActiveOrderViewProps = ActiveOrderActions &
  (
    | { phase: 'creating' }
    | {
        phase: 'unresolved';
        state: 'unknown' | 'ready' | 'rejected';
        closable: boolean;
        busy: boolean;
        message: MessageKey | null;
      }
    | { phase: 'loading'; busy: boolean }
    | {
        phase: 'order';
        wide: boolean;
        order: Order;
        pollStopped: boolean;
        final: boolean;
        busy: boolean;
        /** Previews only: fixed values instead of the live server clock and payment. */
        countdown?: { secondsLeft: number | null; expiry: ExpiryState };
        paid?: PaidInfo;
      }
  );

/**
 * The active order. While it can be paid: a large QR code on white with the order code under it,
 * and beside it (tablet) or under it (phone) the status, the time left and each group's server
 * total. Paid: the payer's amount and price group from the payment. Expired: that nobody paid.
 * "Next customer" appears only once the server's answer is final.
 */
export function ActiveOrderView(props: ActiveOrderViewProps) {
  const { t } = useI18n();
  const { width, height } = useWindowDimensions();
  if (props.phase === 'creating') {
    return (
      <Card>
        <LoadingIndicator label={t('checkout.creating')} />
      </Card>
    );
  }
  if (props.phase === 'loading') {
    return (
      <Card>
        <LoadingIndicator label={t('checkout.loadingOrder')} />
        <Button
          tone="secondary"
          icon="refresh-outline"
          label={t('result.checkAgain')}
          busy={props.busy}
          onPress={props.onCheckAgain}
        />
      </Card>
    );
  }
  if (props.phase === 'unresolved') {
    const refused = props.state === 'rejected';
    return (
      <Card>
        <StatusHeader
          tone={refused ? 'error' : 'warning'}
          icon={refused ? 'close-circle' : 'help-circle'}
          title={t(`checkout.unresolved.${props.state}`)}
          body={t(`checkout.unresolved.${props.state}Body`)}
        />
        {refused ? (
          <Button label={t('checkout.startOver')} onPress={props.onStartOver} />
        ) : (
          <>
            <Button
              icon="shield-checkmark-outline"
              label={t('checkout.sendAgain')}
              busy={props.busy}
              onPress={props.onSendAgain}
            />
            <Button
              tone="secondary"
              label={t('checkout.close')}
              disabled={!props.closable || props.busy}
              onPress={props.onClose}
            />
          </>
        )}
        {props.state === 'unknown' && !props.closable ? (
          <Caption>{t('checkout.closeLater')}</Caption>
        ) : null}
        {props.message ? <Notice tone="warning" title={t(props.message)} /> : null}
      </Card>
    );
  }

  const { order } = props;
  const landscape = width > height;
  const payable = order.status === 'open' || order.status === 'paying';
  const status = orderStatusText(order.status);
  const main = payable ? (
    <QrCard order={order} wide={props.wide} />
  ) : order.status === 'paid' ? (
    <PaidCard paymentId={order.paymentId ?? null} paid={props.paid} />
  ) : (
    <Card>
      <StatusHeader
        tone="warning"
        icon="hourglass-outline"
        title={t('status.order.expired')}
        body={t('checkout.expiredBody')}
        large
      />
    </Card>
  );
  const statusCard = payable ? (
    <Card>
      <StatusHeader
        tone={status.tone}
        icon={order.status === 'paying' ? 'time' : 'qr-code-outline'}
        title={t(status.key)}
        body={t(order.status === 'paying' ? 'checkout.payingBody' : 'checkout.openBody')}
      />
      {order.status === 'open' ? (
        props.countdown ? (
          <Countdown {...props.countdown} />
        ) : (
          <LiveCountdown expiresAt={order.expiresAt} />
        )
      ) : null}
    </Card>
  ) : null;
  const totals = <GroupTotals order={order} />;
  const actions = (
    <>
      {props.pollStopped && payable ? (
        <Button
          tone="secondary"
          icon="refresh-outline"
          label={t('result.checkAgain')}
          busy={props.busy}
          onPress={props.onCheckAgain}
        />
      ) : null}
      {props.final ? (
        <Button icon="arrow-forward" label={t('checkout.next')} onPress={props.onNext} />
      ) : null}
    </>
  );

  if (!props.wide) {
    return (
      <View className="gap-4">
        {main}
        {statusCard}
        {totals}
        {actions}
      </View>
    );
  }
  if (!landscape) {
    // Tablet portrait: the code across the full width, status and totals side by side under it.
    return (
      <View className="gap-4">
        {main}
        {/* Each card is its own screen-reader group (not flattened by Android), or TalkBack reads
            the two side by side line by line across both. */}
        <View className="flex-row flex-wrap items-start gap-4">
          {statusCard ? (
            <View className="min-w-80 flex-1" collapsable={false} importantForAccessibility="yes">
              {statusCard}
            </View>
          ) : null}
          <View className="min-w-80 flex-1" collapsable={false} importantForAccessibility="yes">
            {totals}
          </View>
        </View>
        {actions}
      </View>
    );
  }
  return (
    <View className="flex-row items-start gap-4">
      <View className="flex-[3]" collapsable={false} importantForAccessibility="yes">
        {main}
      </View>
      <View className="flex-[2] gap-4" collapsable={false} importantForAccessibility="yes">
        {statusCard}
        {totals}
        {actions}
      </View>
    </View>
  );
}

/**
 * The code to scan, as large as its column allows (measured once per layout, so it is drawn again
 * only when the space changes, e.g. on rotation), on white with its quiet zone, and the order code
 * under it in a fixed-width face for typing. Nothing is drawn over the code.
 */
function QrCard({ order, wide }: { order: Order; wide: boolean }) {
  const { t } = useI18n();
  const { height } = useWindowDimensions();
  const [boxWidth, setBoxWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent) => {
    const width = Math.round(event.nativeEvent.layout.width);
    if (Math.abs(width - boxWidth) > 1) setBoxWidth(width);
  };
  // Leave room for the till header and the code under the QR on a short (landscape) screen.
  const side = boxWidth > 0 ? qrSide(Math.min(boxWidth - 32, height - 320), wide) : 0;
  return (
    <Card>
      <View onLayout={onLayout} className="items-center gap-4">
        {side > 0 ? (
          <OrderQr payload={order.qrPayload} size={side} label={t('checkout.qrLabel')} />
        ) : (
          <View style={{ height: 240 }} />
        )}
        <View accessible className="items-center gap-1">
          <Caption>{t('checkout.codeLabel')}</Caption>
          <Text
            selectable
            className="text-headline font-semibold text-ink"
            style={[{ fontFamily: MONOSPACE, letterSpacing: 0.5 }, tabularFigures.text]}
          >
            {order.id}
          </Text>
        </View>
      </View>
    </Card>
  );
}

/** A state's icon on its tint, its words as a heading and what it means. */
function StatusHeader(props: {
  tone: Tone;
  icon: IconName;
  title: string;
  body: string;
  large?: boolean;
}) {
  const style = TONE[props.tone];
  return (
    <View className={props.large ? 'items-center gap-3 py-6' : 'flex-row items-start gap-3'}>
      <View className={`items-center justify-center rounded-full p-2 ${style.surface}`}>
        <Icon name={props.icon} size={props.large ? 'hero' : 'lg'} color={style.iconColor} />
      </View>
      <View className={props.large ? 'items-center gap-1' : 'flex-1 gap-1'}>
        <Heading>{props.title}</Heading>
        <Text className={`text-body text-ink-muted ${props.large ? 'text-center' : ''}`}>
          {props.body}
        </Text>
      </View>
    </View>
  );
}

/** Seconds left by the server clock; only this text re-renders every second. */
function LiveCountdown({ expiresAt }: { expiresAt: string }) {
  const now = useServerNow();
  const expiry = expiryState(Date.parse(expiresAt), now);
  const secondsLeft = now
    ? Math.max(0, Math.floor((Date.parse(expiresAt) - now.latest) / 1000))
    : null;
  return <Countdown secondsLeft={secondsLeft} expiry={expiry} />;
}

function Countdown({ secondsLeft, expiry }: { secondsLeft: number | null; expiry: ExpiryState }) {
  const { t } = useI18n();
  if (expiry === 'expired') return <Body>{t('review.expired')}</Body>;
  if (secondsLeft === null || expiry === 'uncertain') {
    return <Caption>{t('review.timeUnknown')}</Caption>;
  }
  const urgent = secondsLeft < 60;
  return (
    <View
      accessible
      accessibilityLabel={t('review.expiresIn', { time: countdownText(secondsLeft) })}
      className="flex-row flex-wrap items-baseline gap-2"
    >
      <Text
        className={`text-display font-bold ${urgent ? 'text-warning-strong' : 'text-ink'}`}
        style={tabularFigures.text}
      >
        {countdownText(secondsLeft)}
      </Text>
      <Caption>{t('checkout.timeLeft')}</Caption>
    </View>
  );
}

/** The server's total for each price group (cashier view); the payer's group decides which applies. */
function GroupTotals({ order }: { order: Order }) {
  const { t, locale } = useI18n();
  if (!order.amounts) return null;
  const amounts = order.amounts;
  return (
    <Card title={t('checkout.serverTotals')}>
      {(['student', 'staff', 'guest'] as const).map((group, index) => (
        <View
          key={group}
          accessible
          accessibilityLabel={`${t(priceGroupKey(group))}: ${formatCents(amounts[group], locale)}`}
          className={`min-h-touch flex-row items-center justify-between gap-3 ${index > 0 ? 'border-t border-line-subtle' : ''}`}
        >
          <Text className="text-body text-ink">{t(priceGroupKey(group))}</Text>
          <AmountText cents={amounts[group]} />
        </View>
      ))}
    </Card>
  );
}

/** What the payer actually paid, from the payment itself (amount and price group). */
function PaidCard({ paymentId, paid }: { paymentId: string | null; paid?: PaidInfo }) {
  if (paid !== undefined || !paymentId) return <PaidView paid={paid ?? 'unknown'} />;
  return <LivePaid paymentId={paymentId} />;
}

function LivePaid({ paymentId }: { paymentId: string }) {
  const { view, failure } = usePaymentDetail(paymentId);
  const payment = view?.payment;
  return (
    <PaidView
      paid={
        payment
          ? { amountCents: payment.amountCents, priceGroup: payment.priceGroup }
          : failure
            ? 'unknown'
            : 'loading'
      }
    />
  );
}

function PaidView({ paid }: { paid: PaidInfo }) {
  const { t } = useI18n();
  const style = TONE.ok;
  return (
    <Card>
      <View className="items-center gap-3 py-6">
        <View className={`items-center justify-center rounded-full p-3 ${style.surface}`}>
          <Icon name="checkmark-circle" size="hero" color={style.iconColor} />
        </View>
        <Heading>{t('status.order.paid')}</Heading>
        {paid === 'loading' ? (
          <LoadingIndicator label={t('detail.loading')} />
        ) : paid === 'unknown' ? (
          <Body muted>{t('checkout.paidAmountUnknown')}</Body>
        ) : (
          <View accessible className="items-center gap-2">
            <AmountText cents={paid.amountCents} size="display" />
            <Tag
              icon="pricetag-outline"
              label={t('checkout.paidAs', { group: t(priceGroupKey(paid.priceGroup)) })}
            />
          </View>
        )}
      </View>
    </Card>
  );
}
