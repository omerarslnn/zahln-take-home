// Development only: the till's real views in each of their states, rendered from fixed sample data,
// so every state can be reviewed and photographed without a real order, payment or refund.
// Registered only when __DEV__ (like the design catalogue), so release bundles contain none of it.
// The sample data is invented on purpose and never sent anywhere; the screens' rules are not used.
import type { Mensa, Order, Payment, PaymentDetail } from '@mensa/api';
import { useI18n } from '@mensa/shared/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { JSX } from 'react';
import { ScrollView, useWindowDimensions } from 'react-native';
import { ActiveOrderView, type ActiveOrderViewProps } from '../components/ActiveOrder';
import { Caption, Card, ListRow, Screen } from '../components/ui';
import type { TillStackParamList } from '../navigation';
import { checkRefundAmount, refundInputText } from '../till-rules';
import { CheckoutView, type CheckoutViewProps } from './CheckoutScreen';
import {
  RefundPanelView,
  RefundRowView,
  TillPaymentDetailView,
  type RefundPanelViewProps,
} from './PaymentDetailScreen';

const noop = () => undefined;
const ACTIONS = {
  onSendAgain: noop,
  onClose: noop,
  onStartOver: noop,
  onCheckAgain: noop,
  onNext: noop,
};

export const SAMPLE_MENSA: Mensa = {
  id: 'mns_preview',
  name: 'Mensa am Campus',
  city: 'Musterstadt',
  tills: [{ id: 'till_preview', name: 'Kasse 1' }],
  menu: [
    {
      id: 'itm_veg',
      name: { de: 'Vegetarisches Tagesgericht', en: 'Vegetarian dish of the day' },
      prices: { student: 250, staff: 420, guest: 560 },
    },
    {
      id: 'itm_pasta',
      name: { de: 'Pasta mit Tomatensauce', en: 'Pasta with tomato sauce' },
      prices: { student: 220, staff: 380, guest: 490 },
    },
    {
      id: 'itm_soup',
      name: { de: 'Tagessuppe', en: 'Soup of the day' },
      prices: { student: 120, staff: 200, guest: 260 },
    },
    {
      id: 'itm_coffee',
      name: { de: 'Kaffee', en: 'Coffee' },
      prices: { student: 110, staff: 140, guest: 170 },
    },
  ],
};

const ORDER: Order = {
  id: 'ord_3f9c2a71b8d04e65',
  status: 'open',
  mensa: { id: 'mns_preview', name: 'Mensa am Campus' },
  till: { id: 'till_preview', name: 'Kasse 1' },
  items: [
    { itemId: 'itm_veg', name: SAMPLE_MENSA.menu[0]!.name, quantity: 1 },
    { itemId: 'itm_pasta', name: SAMPLE_MENSA.menu[1]!.name, quantity: 2 },
  ],
  qrPayload: 'zahln://pay?order=ord_3f9c2a71b8d04e65',
  currency: 'EUR',
  amounts: { student: 690, staff: 1180, guest: 1540 },
  priceGroup: null,
  amountCents: null,
  paymentId: null,
  createdAt: '2026-11-05T11:00:00Z',
  expiresAt: '2026-11-05T11:05:00Z',
  version: 1,
};

type OrderPreview = Omit<Extract<ActiveOrderViewProps, { phase: 'order' }>, 'wide'>;

/** An active-order state, laid out as the checkout shows it (two columns on a tablet). */
function OrderState(props: OrderPreview) {
  const { width } = useWindowDimensions();
  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="gap-4 p-4">
      <ActiveOrderView {...props} wide={width >= 768} />
    </ScrollView>
  );
}

const ORDER_STATE: OrderPreview = {
  ...ACTIONS,
  phase: 'order',
  order: ORDER,
  pollStopped: false,
  final: false,
  busy: false,
  countdown: { secondsLeft: 245, expiry: 'not_expired' },
};

const CHECKOUT: Omit<CheckoutViewProps, 'basket'> = {
  mensa: SAMPLE_MENSA,
  till: SAMPLE_MENSA.tills[0] ?? null,
  cashier: 'Mensa am Campus, Kasse 1',
  menuFailure: null,
  recordsUnavailable: false,
  ready: true,
  creating: false,
  message: null,
  activeOrder: null,
  onAdd: noop,
  onRemove: noop,
  onCreate: noop,
  onClear: noop,
  onRetryMenu: noop,
  onPayments: noop,
  onSwitchCashier: noop,
  onDiagnostics: noop,
};

const PAYMENT: Payment = {
  id: 'pay_10e932549a4a402f',
  orderId: 'ord_3f9c2a71b8d04e65',
  status: 'confirmed',
  amountCents: 1000,
  currency: 'EUR',
  priceGroup: 'student',
  mensa: { id: 'mns_preview', name: 'Mensa am Campus' },
  till: { id: 'till_preview', name: 'Kasse 1' },
  payer: { id: 'usr_preview', displayName: 'Test Student' },
  items: [
    { itemId: 'itm_veg', name: SAMPLE_MENSA.menu[0]!.name, quantity: 2, unitPriceCents: 250 },
    { itemId: 'itm_pasta', name: SAMPLE_MENSA.menu[1]!.name, quantity: 2, unitPriceCents: 220 },
    { itemId: 'itm_coffee', name: SAMPLE_MENSA.menu[3]!.name, quantity: 1, unitPriceCents: 60 },
  ],
  refundedAmountCents: 100,
  pendingRefundAmountCents: 0,
  refundableAmountCents: 900,
  needsAttention: false,
  attentionReasons: [],
  createdAt: '2026-11-05T12:53:00Z',
  updatedAt: '2026-11-05T13:10:00Z',
  version: 4,
};
const DETAIL: PaymentDetail = {
  ...PAYMENT,
  refunds: [
    {
      id: 'ref_1',
      paymentId: PAYMENT.id,
      amountCents: 100,
      currency: 'EUR',
      status: 'completed',
      reason: 'Coffee spilled',
      createdAt: '2026-11-05T13:09:00Z',
      updatedAt: '2026-11-05T13:10:00Z',
    },
  ],
  history: [
    { at: '2026-11-05T12:53:00Z', type: 'payment_created', amountCents: 1000, refundId: null },
    { at: '2026-11-05T12:53:04Z', type: 'payment_confirmed', amountCents: 1000, refundId: null },
    { at: '2026-11-05T13:09:00Z', type: 'refund_requested', amountCents: 100, refundId: 'ref_1' },
    { at: '2026-11-05T13:10:00Z', type: 'refund_completed', amountCents: 100, refundId: 'ref_1' },
  ],
};

const REFUND_FORM: Omit<RefundPanelViewProps, 'refundableCents' | 'amount'> = {
  payer: 'Test Student',
  blocked: null,
  rows: [],
  amountText: '',
  reason: '',
  confirming: null,
  busy: false,
  message: null,
  onAmountChange: noop,
  onReasonChange: noop,
  onFillRemaining: noop,
  onReview: noop,
  onConfirm: noop,
  onCancel: noop,
};
const ROW = {
  amountCents: 250,
  refusal: null,
  final: false,
  busy: false,
  message: null,
  onSendAgain: noop,
  onDismiss: noop,
};

/** A €2.50 refund the server holds as pending: it reserves capacity (invariant 10). */
const PENDING_PAYMENT: Payment = {
  ...PAYMENT,
  pendingRefundAmountCents: 250,
  refundableAmountCents: 650,
  version: 5,
};
const PENDING_DETAIL: PaymentDetail = {
  ...DETAIL,
  ...PENDING_PAYMENT,
  refunds: [
    ...DETAIL.refunds,
    {
      id: 'ref_2',
      paymentId: PAYMENT.id,
      amountCents: 250,
      currency: 'EUR',
      status: 'pending',
      reason: 'Wrong dish',
      createdAt: '2026-11-05T13:20:00Z',
      updatedAt: '2026-11-05T13:20:00Z',
    },
  ],
  history: [
    ...DETAIL.history,
    { at: '2026-11-05T13:20:00Z', type: 'refund_requested', amountCents: 250, refundId: 'ref_2' },
  ],
};

/** The rest refunded too: nothing is left. */
const REFUNDED_PAYMENT: Payment = {
  ...PAYMENT,
  refundedAmountCents: 1000,
  refundableAmountCents: 0,
  version: 6,
};
const REFUNDED_DETAIL: PaymentDetail = {
  ...DETAIL,
  ...REFUNDED_PAYMENT,
  refunds: [
    ...DETAIL.refunds,
    {
      id: 'ref_3',
      paymentId: PAYMENT.id,
      amountCents: 900,
      currency: 'EUR',
      status: 'completed',
      reason: 'Order cancelled',
      createdAt: '2026-11-05T13:30:00Z',
      updatedAt: '2026-11-05T13:31:00Z',
    },
  ],
  history: [
    ...DETAIL.history,
    { at: '2026-11-05T13:30:00Z', type: 'refund_requested', amountCents: 900, refundId: 'ref_3' },
    { at: '2026-11-05T13:31:00Z', type: 'refund_completed', amountCents: 900, refundId: 'ref_3' },
  ],
};

type PanelPreview = Partial<Omit<RefundPanelViewProps, 'refundableCents' | 'amount'>> & {
  /** Typed amount in cents, shown in the current language's format. */
  typedCents?: number;
};

/**
 * The payment detail as the till shows it, with the given refund panel state. The panel's figure
 * is the sample payment's `refundableAmountCents`, as on the real screen, so the two never differ.
 */
function DetailPreview({
  payment = PAYMENT,
  detail = DETAIL,
  panel = {},
}: {
  payment?: Payment;
  detail?: PaymentDetail;
  panel?: PanelPreview;
}) {
  const { locale } = useI18n();
  const { typedCents, ...rest } = panel;
  const amountText = typedCents === undefined ? '' : refundInputText(typedCents, locale);
  const refundable = payment.refundableAmountCents;
  return (
    <TillPaymentDetailView
      payment={payment}
      detail={detail}
      loading={false}
      failure={null}
      onReload={noop}
      refundPanel={
        <RefundPanelView
          {...REFUND_FORM}
          {...rest}
          amountText={amountText}
          refundableCents={refundable}
          amount={checkRefundAmount(amountText, refundable)}
        />
      }
    />
  );
}

type Preview = { title: string; render: () => JSX.Element };

const PREVIEWS: Record<string, Preview> = {
  'checkout-basket': {
    title: 'Checkout: items in the order',
    render: () => (
      <CheckoutView
        {...CHECKOUT}
        basket={[
          { itemId: 'itm_veg', quantity: 1 },
          { itemId: 'itm_pasta', quantity: 2 },
        ]}
      />
    ),
  },
  'checkout-creating': {
    title: 'Checkout: creating the order',
    render: () => (
      <CheckoutView {...CHECKOUT} creating basket={[{ itemId: 'itm_soup', quantity: 1 }]} />
    ),
  },
  'checkout-menu-loading': {
    title: 'Checkout: menu loading',
    render: () => <CheckoutView {...CHECKOUT} mensa={null} till={null} basket={[]} />,
  },
  'checkout-offline': {
    title: 'Checkout: menu offline',
    render: () => (
      <CheckoutView {...CHECKOUT} mensa={null} till={null} menuFailure="offline" basket={[]} />
    ),
  },
  'order-open': {
    title: 'Order: waiting for payment',
    render: () => <OrderState {...ORDER_STATE} />,
  },
  'order-last-minute': {
    title: 'Order: last minute',
    render: () => (
      <OrderState {...ORDER_STATE} countdown={{ secondsLeft: 38, expiry: 'not_expired' }} />
    ),
  },
  'order-paying': {
    title: 'Order: payment being checked',
    render: () => (
      <OrderState {...ORDER_STATE} order={{ ...ORDER, status: 'paying', paymentId: 'pay_1' }} />
    ),
  },
  'order-check-again': {
    title: 'Order: checking stopped',
    render: () => <OrderState {...ORDER_STATE} pollStopped />,
  },
  'order-paid': {
    title: 'Order: paid',
    render: () => (
      <OrderState
        {...ORDER_STATE}
        order={{ ...ORDER, status: 'paid', paymentId: 'pay_1' }}
        final
        paid={{ amountCents: 690, priceGroup: 'student' }}
      />
    ),
  },
  'order-expired': {
    title: 'Order: expired',
    render: () => <OrderState {...ORDER_STATE} order={{ ...ORDER, status: 'expired' }} final />,
  },
  'order-unknown': {
    title: 'Order: create outcome not known',
    render: () => (
      <Screen>
        <ActiveOrderView
          {...ACTIONS}
          phase="unresolved"
          state="unknown"
          closable={false}
          busy={false}
          message={null}
        />
      </Screen>
    ),
  },
  'order-refused': {
    title: 'Order: refused',
    render: () => (
      <Screen>
        <ActiveOrderView
          {...ACTIONS}
          phase="unresolved"
          state="rejected"
          closable={false}
          busy={false}
          message={null}
        />
      </Screen>
    ),
  },
  'refund-form': {
    title: 'Refund: form, amount too high',
    render: () => <DetailPreview panel={{ typedCents: 950, reason: 'Wrong dish' }} />,
  },
  'refund-confirm': {
    title: 'Refund: confirmation step',
    render: () => <DetailPreview panel={{ typedCents: 250, confirming: 250 }} />,
  },
  'refund-unknown': {
    title: 'Refund: outcome not known',
    render: () => (
      <DetailPreview
        panel={{
          blocked: 'refund.blocked.unresolved',
          rows: [
            <RefundRowView
              key="r"
              {...ROW}
              state="unknown"
              status={{ tone: 'warning', key: 'refund.state.checking' }}
            />,
          ],
        }}
      />
    ),
  },
  'refund-pending': {
    title: 'Refund: being processed',
    render: () => (
      <DetailPreview
        payment={PENDING_PAYMENT}
        detail={PENDING_DETAIL}
        panel={{
          blocked: 'refund.blocked.pending',
          rows: [
            <RefundRowView
              key="r"
              {...ROW}
              state="applied"
              status={{ tone: 'pending', key: 'status.refund.pending' }}
            />,
          ],
        }}
      />
    ),
  },
  'refund-nothing-left': {
    title: 'Refund: nothing left',
    render: () => (
      <DetailPreview
        payment={REFUNDED_PAYMENT}
        detail={REFUNDED_DETAIL}
        panel={{ blocked: 'refund.blocked.nothingLeft' }}
      />
    ),
  },
  'order-creating': {
    title: 'Order: creating',
    render: () => (
      <Screen>
        <ActiveOrderView {...ACTIONS} phase="creating" />
      </Screen>
    ),
  },
};

type ListProps = NativeStackScreenProps<TillStackParamList, 'TillStates'>;

/** The list of states; each opens the real view with sample data, in the current language. */
export function TillStatesScreen({ navigation }: ListProps) {
  const { locale } = useI18n();
  return (
    <Screen>
      <Caption>
        Development only. Real views, sample data ({locale}); nothing is sent and nothing is saved.
      </Caption>
      <Card>
        {Object.entries(PREVIEWS).map(([id, preview], index) => (
          <ListRow
            key={id}
            title={preview.title}
            separated={index > 0}
            onPress={() => navigation.navigate('TillStatePreview', { state: id })}
          />
        ))}
      </Card>
    </Screen>
  );
}

type PreviewProps = NativeStackScreenProps<TillStackParamList, 'TillStatePreview'>;

export function TillStatePreviewScreen({ route }: PreviewProps) {
  const preview = PREVIEWS[route.params.state];
  return preview ? (
    preview.render()
  ) : (
    <Screen>
      <Caption>{route.params.state}</Caption>
    </Screen>
  );
}
