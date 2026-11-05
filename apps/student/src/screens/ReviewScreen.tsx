import {
  expiryState,
  isFinal,
  paymentDisplay,
  PaymentAuthorizer,
  type PayOrderIntent,
  type PaymentBinding,
} from '@mensa/domain';
import { formatCents } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { GateState, Order } from '@mensa/domain';
import { useLayoutEffect, useRef, useState, type Ref } from 'react';
import { View } from 'react-native';
import { gateAnnouncement, paymentsOpen } from '../availability';
import { CountdownTag, MerchantHeader, OrderItemRow, PayAction } from '../components/OrderParts';
import { AvailabilityNotice } from '../components/PaymentAvailability';
import { priceGroupKey } from '../components/payment-text';
import {
  AmountText,
  Body,
  Button,
  Caption,
  Card,
  LoadingIndicator,
  Notice,
  Screen,
  Skeleton,
  Tag,
  useAccessibilityFocus,
  useAnnouncement,
} from '../components/ui';
import { authenticateLocally } from '../local-auth';
import type { RootStackParamList } from '../navigation';
import { afterPayAttempt, type ScreenMessage } from '../payment-outcome';
import {
  useControllerRevision,
  usePaymentGate,
  usePaymentServices,
  useServerNow,
} from '../payments/PaymentServices';
import { useOrder, type OrderFailure } from '../useOrder';

type Props = NativeStackScreenProps<RootStackParamList, 'Review'>;

/**
 * Shows the scanned order as the server prices it for this payer, and pays exactly that after local
 * authorization. The server is the authority: the amount is its `amountCents`, never a sum computed
 * here, and expiry is judged by server time. This container owns every rule (the authorization
 * binding, the guards, the navigation); `ReviewView` only renders what it is given.
 */
export function ReviewScreen({ route, navigation }: Props) {
  const { orderId } = route.params;
  const { t, locale } = useI18n();
  const { user, controller, services } = usePaymentServices();
  useControllerRevision(controller);
  const { order, failure, reload } = useOrder(orderId);
  const gate = usePaymentGate();
  const now = useServerNow();
  const focused = useIsFocused();
  const authorizer = useRef(
    new PaymentAuthorizer(() => services?.session.user()?.id ?? null),
  ).current;
  const [busy, setBusy] = useState(false);
  // Never a copy of the gate's state: the availability notice below reads the live gate.
  const [message, setMessage] = useState<ScreenMessage | null>(null);

  // What the screen shows, for the check after the prompt. Every change the payer must see again
  // (state, version, amount) is a new review: an authorization given for the previous one is not
  // spent on this one. Written after each render, read only in handlers (after the prompt).
  const signature = order ? `${order.status}|${order.version}|${order.amountCents ?? ''}` : '';
  const shown = useRef({ order, focused, signature, reviewId: 0 });
  useLayoutEffect(() => {
    const changed = shown.current.signature !== signature;
    shown.current = {
      order,
      focused,
      signature,
      reviewId: shown.current.reviewId + (changed ? 1 : 0),
    };
  });
  const summaryRef = useAccessibilityFocus<View>(order ? order.id : null);
  // Availability changing while the payer reviews an open order (stopped, or back): said once.
  useAnnouncement(order?.status === 'open' ? gateAnnouncement(gate, t) : null, true);

  // This payer's earlier action for this order: an unresolved one is resumed, never duplicated.
  const existing = (controller?.list() ?? [])
    .filter((r): r is PayOrderIntent => r.kind === 'payOrder' && r.payload.orderId === orderId)
    .sort((a, b) => Number(isFinal(a)) - Number(isFinal(b)))[0];
  const unresolved = existing && !isFinal(existing) ? existing : undefined;
  const paidByMe = existing && paymentDisplay(existing) === 'confirmed';

  const amount = order?.amountCents ?? null;
  const expiry = order ? expiryState(Date.parse(order.expiresAt), now) : 'uncertain';
  const secondsLeft =
    order && now
      ? Math.max(0, Math.floor((Date.parse(order.expiresAt) - now.latest) / 1000))
      : null;
  const payable =
    order?.status === 'open' &&
    amount !== null &&
    expiry !== 'expired' &&
    paymentsOpen(gate) &&
    controller !== null &&
    !unresolved &&
    !paidByMe;

  function currentBinding(): PaymentBinding | null {
    const now = shown.current;
    if (!user || !now.focused || now.order?.status !== 'open') return null;
    if (now.order.amountCents == null) return null;
    return { userId: user.id, orderId, amountCents: now.order.amountCents, reviewId: now.reviewId };
  }

  async function pay() {
    const binding = currentBinding();
    if (!controller || !binding) return;
    setMessage(null);
    setBusy(true);
    const formatted = formatCents(binding.amountCents, locale);
    const outcome = await authorizer.run({
      binding,
      authenticate: () =>
        authenticateLocally({
          prompt: t('auth.prompt', { amount: formatted }),
          cancel: t('auth.cancel'),
        }),
      current: currentBinding,
      // After a known final result (declined, refused) a new attempt is a deliberate new action.
      send: () =>
        controller.payOrder(
          orderId,
          binding.amountCents,
          existing && isFinal(existing) ? { afterFinalKey: existing.key } : {},
        ),
    });
    setBusy(false);
    const next = afterPayAttempt(outcome);
    if (next.type === 'show_result') {
      // Back from the result goes home, not to a review of an order that is being paid.
      navigation.reset({
        index: 1,
        routes: [{ name: 'Home' }, { name: 'Result', params: { key: next.key } }],
      });
    } else {
      setMessage(next.message);
    }
  }

  if (!order) {
    return (
      <ReviewLoading
        failure={failure}
        onRetry={() => void reload()}
        onBack={() => navigation.goBack()}
      />
    );
  }

  const formattedAmount = amount !== null ? formatCents(amount, locale) : '–';
  return (
    <ReviewView
      order={order}
      expiry={expiry}
      secondsLeft={secondsLeft}
      gate={gate}
      pay={
        payable
          ? {
              label: t(existing ? 'review.payAgain' : 'review.pay', { amount: formattedAmount }),
              busy,
              onPress: () => void pay(),
            }
          : null
      }
      earlier={unresolved ? 'unresolved' : paidByMe ? 'paidByMe' : null}
      onShowStatus={() => existing && navigation.navigate('Result', { key: existing.key })}
      message={message}
      summaryRef={summaryRef}
    />
  );
}

export interface ReviewViewProps {
  /** The payer's view of the order: mensa, till, items with the payer's unit prices, amount. */
  order: Order;
  expiry: 'not_expired' | 'expired' | 'uncertain';
  /** Seconds left by server time; null while the server time is not known. */
  secondsLeft: number | null;
  gate: GateState | null;
  /** The pay action, only while paying is possible. */
  pay: { label: string; busy: boolean; onPress: () => void } | null;
  /** This payer's earlier action for the order. */
  earlier: 'unresolved' | 'paidByMe' | null;
  onShowStatus: () => void;
  message: ScreenMessage | null;
  summaryRef?: Ref<View>;
}

/**
 * The review: where, the amount to pay as the hero with the server's price group and the time
 * left, the items, then whatever stands in the way (the order's state, availability, an earlier
 * payment, the last message). "Pay" sits in the bottom bar, above the home indicator.
 */
export function ReviewView({ summaryRef, ...props }: ReviewViewProps) {
  const { t, locale } = useI18n();
  const { order } = props;
  const amount = order.amountCents ?? null;
  const formattedAmount = amount !== null ? formatCents(amount, locale) : '–';
  return (
    <Screen
      footer={
        props.pay ? (
          <PayAction label={props.pay.label} busy={props.pay.busy} onPress={props.pay.onPress} />
        ) : undefined
      }
    >
      <MerchantHeader ref={summaryRef} mensa={order.mensa.name} till={order.till.name} />

      <Card>
        <View accessible accessibilityLabel={t('review.amountLabel', { amount: formattedAmount })}>
          <Caption>{t('review.amount')}</Caption>
          {amount !== null ? <AmountText cents={amount} size="display" /> : <Body muted>–</Body>}
        </View>
        <View className="flex-row flex-wrap gap-2">
          {order.priceGroup ? (
            <Tag
              icon="pricetag-outline"
              label={t('home.priceGroup', { group: t(priceGroupKey(order.priceGroup)) })}
            />
          ) : null}
          {order.status === 'open' &&
          props.expiry === 'not_expired' &&
          props.secondsLeft !== null ? (
            <CountdownTag secondsLeft={props.secondsLeft} />
          ) : null}
        </View>
      </Card>

      <Card title={t('payment.items')}>
        {order.items.map((item, index) => (
          <OrderItemRow
            key={item.itemId}
            quantity={item.quantity}
            name={item.name[locale]}
            unitPriceCents={item.unitPriceCents ?? null}
            separated={index > 0}
          />
        ))}
      </Card>

      <OrderState
        status={order.status}
        ownPayment={Boolean(order.paymentId)}
        expiry={props.expiry}
        secondsLeft={props.secondsLeft}
      />

      {order.status === 'open' ? <AvailabilityNotice gate={props.gate} /> : null}

      {props.earlier ? (
        <Notice
          tone="neutral"
          title={t(props.earlier === 'unresolved' ? 'review.alreadyStarted' : 'review.paidByYou')}
          actions={
            <Button tone="secondary" label={t('review.showStatus')} onPress={props.onShowStatus} />
          }
        />
      ) : null}

      {props.message ? (
        <Notice
          tone={props.message.tone}
          title={t(props.message.key)}
          description={props.message.key === 'auth.not_enrolled' ? t('auth.enrollHelp') : undefined}
        />
      ) : null}
    </Screen>
  );
}

/** The order on its way (placeholders in the review's shape), or why it could not be read. */
export function ReviewLoading({
  failure,
  onRetry,
  onBack,
}: {
  failure: OrderFailure | null;
  onRetry: () => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  if (failure) {
    return (
      <Screen>
        <Notice
          tone="error"
          title={t(`review.failure.${failure}`)}
          actions={
            <>
              <Button label={t('common.retry')} onPress={onRetry} />
              <Button tone="secondary" label={t('scan.again')} onPress={onBack} />
            </>
          }
        />
      </Screen>
    );
  }
  return (
    <Screen>
      <View className="flex-row items-center gap-3">
        <Skeleton width={48} height={48} />
        <View className="flex-1 gap-2">
          <Skeleton width="70%" height={24} />
          <Skeleton width="40%" height={14} />
        </View>
      </View>
      <Card>
        <Skeleton width="35%" height={14} />
        <Skeleton width="55%" height={40} />
      </Card>
      <LoadingIndicator label={t('review.loading')} />
    </Screen>
  );
}

/**
 * What stands in the way on the order itself. While it is open and the time is known, the countdown
 * tag in the amount card says how long is left, so nothing is shown here.
 */
function OrderState(props: {
  status: 'open' | 'paying' | 'paid' | 'expired';
  ownPayment: boolean;
  expiry: 'not_expired' | 'expired' | 'uncertain';
  secondsLeft: number | null;
}) {
  const { t } = useI18n();
  if (props.status === 'paid') {
    return (
      <Notice tone="ok" title={t(props.ownPayment ? 'review.paidByYou' : 'review.paidByOther')} />
    );
  }
  if (props.status === 'paying') {
    return (
      <Notice
        tone="pending"
        title={t(props.ownPayment ? 'review.yoursChecking' : 'review.otherChecking')}
      />
    );
  }
  if (props.status === 'expired' || props.expiry === 'expired') {
    return <Notice tone="warning" title={t('review.expired')} />;
  }
  if (props.secondsLeft === null || props.expiry === 'uncertain') {
    return <Body muted>{t('review.timeUnknown')}</Body>;
  }
  return null;
}
