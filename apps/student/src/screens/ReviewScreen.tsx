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
import { useLayoutEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { gateAnnouncement, paymentsOpen } from '../availability';
import { AvailabilityNotice } from '../components/PaymentAvailability';
import { priceGroupKey } from '../components/payment-text';
import {
  Body,
  Button,
  Card,
  LabelledValue,
  Notice,
  Screen,
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
import { useOrder } from '../useOrder';

type Props = NativeStackScreenProps<RootStackParamList, 'Review'>;

/**
 * Shows the scanned order as the server prices it for this payer, and pays exactly that after local
 * authorization. The server is the authority: the amount is its `amountCents`, never a sum computed
 * here, and expiry is judged by server time.
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
      <Screen>
        {failure ? (
          <Notice
            tone="error"
            title={t(`review.failure.${failure}`)}
            actions={
              <>
                <Button label={t('common.retry')} onPress={() => void reload()} />
                <Button
                  tone="secondary"
                  label={t('scan.again')}
                  onPress={() => navigation.goBack()}
                />
              </>
            }
          />
        ) : (
          <Notice tone="neutral" title={t('review.loading')} />
        )}
      </Screen>
    );
  }

  const formattedAmount = amount !== null ? formatCents(amount, locale) : '–';
  return (
    <Screen
      footer={
        <>
          <View
            accessible
            accessibilityLabel={t('review.amountLabel', { amount: formattedAmount })}
          >
            <Text className="text-base text-ink-muted">{t('review.amount')}</Text>
            <Text className="text-3xl font-bold text-ink">{formattedAmount}</Text>
          </View>
          {payable ? (
            <Button
              label={t(existing ? 'review.payAgain' : 'review.pay', { amount: formattedAmount })}
              hint={t('review.payHint')}
              busy={busy}
              onPress={() => void pay()}
            />
          ) : null}
        </>
      }
    >
      <View ref={summaryRef} accessible className="gap-1">
        <Text accessibilityRole="header" className="text-2xl font-bold text-ink">
          {order.mensa.name}
        </Text>
        <Body muted>{order.till.name}</Body>
      </View>

      <Card title={t('payment.items')}>
        {order.items.map((item) => (
          <Text key={item.itemId} className="text-base text-ink">
            {item.quantity} × {item.name[locale]}
            {item.unitPriceCents != null
              ? ` · ${t('payment.each', { price: formatCents(item.unitPriceCents, locale) })}`
              : ''}
          </Text>
        ))}
        <LabelledValue
          label={t('payment.priceGroup')}
          value={order.priceGroup ? t(priceGroupKey(order.priceGroup)) : '–'}
        />
      </Card>

      <OrderState
        status={order.status}
        ownPayment={Boolean(order.paymentId)}
        expiry={expiry}
        secondsLeft={secondsLeft}
      />

      {order.status === 'open' ? <AvailabilityNotice gate={gate} /> : null}

      {unresolved || paidByMe ? (
        <Notice
          tone="neutral"
          title={t(unresolved ? 'review.alreadyStarted' : 'review.paidByYou')}
          actions={
            <Button
              tone="secondary"
              label={t('review.showStatus')}
              onPress={() => existing && navigation.navigate('Result', { key: existing.key })}
            />
          }
        />
      ) : null}

      {message ? (
        <Notice
          tone={message.tone}
          title={t(message.key)}
          description={message.key === 'auth.not_enrolled' ? t('auth.enrollHelp') : undefined}
        />
      ) : null}
    </Screen>
  );
}

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
  const minutes = Math.floor(props.secondsLeft / 60);
  const seconds = String(props.secondsLeft % 60).padStart(2, '0');
  return <Body muted>{t('review.expiresIn', { time: `${minutes}:${seconds}` })}</Body>;
}
