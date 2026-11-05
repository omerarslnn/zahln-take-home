// Development only: the payment screens' real views in each of their states, rendered from fixed
// sample data, so every state can be reviewed and photographed without a real order or payment.
// Registered only when __DEV__ (like the design catalogue), so release bundles contain none of it.
// The sample data is invented on purpose and never sent anywhere; the screens' rules are not used.
import type { Payment, PaymentDetail } from '@mensa/api';
import type { GateState, Order, PaymentDisplay, PayOrderIntent } from '@mensa/domain';
import { formatCents } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Caption, Card, ListRow, Screen } from '../components/ui';
import type { RootStackParamList } from '../navigation';
import { describeOutcome } from '../payment-outcome';
import { historySections } from '../history-sections';
import { HistoryView } from './HistoryScreen';
import { HomeView } from './HomeScreen';
import { PaymentDetailView } from './PaymentDetailScreen';
import { ResultView } from './ResultScreen';
import { ReviewLoading, ReviewView, type ReviewViewProps } from './ReviewScreen';

const OPEN: GateState = { status: 'open' };
const BLOCKED: GateState = { status: 'blocked', reason: 'config_unavailable' };
const noop = () => undefined;

const ORDER: Order = {
  id: 'ord_preview',
  status: 'open',
  mensa: { id: 'mns_preview', name: 'Mensa am Campus' },
  till: { id: 'till_preview', name: 'Kasse 1' },
  items: [
    {
      itemId: 'itm_pasta',
      name: { de: 'Pasta mit Tomatensauce', en: 'Pasta with tomato sauce' },
      quantity: 1,
      unitPriceCents: 520,
    },
    {
      itemId: 'itm_salad',
      name: { de: 'Kleiner Salat', en: 'Side salad' },
      quantity: 2,
      unitPriceCents: 130,
    },
  ],
  qrPayload: 'zahln://pay?order=ord_preview',
  currency: 'EUR',
  amounts: null,
  priceGroup: 'student',
  amountCents: 780,
  paymentId: null,
  createdAt: '2026-11-05T11:00:00Z',
  expiresAt: '2026-11-05T11:05:00Z',
  version: 1,
};

const REVIEW: Omit<ReviewViewProps, 'pay'> = {
  order: ORDER,
  expiry: 'not_expired',
  secondsLeft: 245,
  gate: OPEN,
  earlier: null,
  onShowStatus: noop,
  message: null,
};

/** The review with its pay action as the real screen labels it ("Pay 7,80 €" in German). */
function ReviewPreview({
  payable,
  busy = false,
  ...props
}: Omit<ReviewViewProps, 'pay'> & { payable: boolean; busy?: boolean }) {
  const { t, locale } = useI18n();
  const pay = payable
    ? { label: t('review.pay', { amount: formatCents(780, locale) }), busy, onPress: noop }
    : null;
  return <ReviewView {...props} pay={pay} />;
}

type Preview = { title: string; render: () => React.JSX.Element };

const PREVIEWS: Record<string, Preview> = {
  ...homePreviews(),
  'review-open': { title: 'Review: open', render: () => <ReviewPreview {...REVIEW} payable /> },
  'review-last-minute': {
    title: 'Review: last minute',
    render: () => <ReviewPreview {...REVIEW} secondsLeft={42} payable />,
  },
  'review-paying': {
    title: 'Review: paying (busy)',
    render: () => <ReviewPreview {...REVIEW} payable busy />,
  },
  'review-blocked': {
    title: 'Review: availability unknown',
    render: () => <ReviewPreview {...REVIEW} gate={BLOCKED} payable={false} />,
  },
  'review-cancelled': {
    title: 'Review: confirmation cancelled',
    render: () => (
      <ReviewPreview {...REVIEW} payable message={{ tone: 'neutral', key: 'auth.cancelled' }} />
    ),
  },
  'review-unresolved': {
    title: 'Review: earlier payment unresolved',
    render: () => <ReviewPreview {...REVIEW} earlier="unresolved" payable={false} />,
  },
  'review-being-checked': {
    title: 'Review: your payment is being checked',
    render: () => (
      <ReviewPreview
        {...REVIEW}
        order={{ ...ORDER, status: 'paying', paymentId: 'pay_preview' }}
        payable={false}
      />
    ),
  },
  'review-paid-other': {
    title: 'Review: paid by someone else',
    render: () => (
      <ReviewPreview {...REVIEW} order={{ ...ORDER, status: 'paid' }} payable={false} />
    ),
  },
  'review-expired': {
    title: 'Review: expired',
    render: () => (
      <ReviewPreview
        {...REVIEW}
        order={{ ...ORDER, status: 'expired' }}
        expiry="expired"
        secondsLeft={0}
        payable={false}
      />
    ),
  },
  'review-loading': {
    title: 'Review: loading',
    render: () => <ReviewLoading failure={null} onRetry={noop} onBack={noop} />,
  },
  'review-offline': {
    title: 'Review: offline',
    render: () => <ReviewLoading failure="offline" onRetry={noop} onBack={noop} />,
  },
  ...resultPreviews(),
  ...historyPreviews(),
};

function homePreviews(): Record<string, Preview> {
  const at = (iso: string) => Date.parse(iso);
  const with_ = (
    display: PaymentDisplay,
    key: string,
    sentAt: string,
    refusal: string | null = null,
  ) => ({
    record: { ...sampleIntent(display, refusal), key, lastSentAt: at(sentAt) },
    place: 'Mensa am Campus',
  });
  const base = {
    name: 'Test Student',
    priceGroup: 'student' as const,
    ready: true,
    recordsUnavailable: false,
    gate: OPEN,
    attention: [],
    recent: [],
    onScan: noop,
    onOpenResult: noop,
    onHistory: noop,
    onSwitchAccount: noop,
    onDiagnostics: noop,
  };
  return {
    'home-activity': {
      title: 'Home: unfinished and recent payments',
      render: () => (
        <HomeView
          {...base}
          attention={[
            with_('checking', 'k1', '2026-11-05T11:20:00Z', 'unavailable'),
            with_('pending', 'k2', '2026-11-05T11:12:00Z'),
          ]}
          recent={[
            with_('confirmed', 'k3', '2026-11-05T11:02:00Z'),
            with_('declined', 'k4', '2026-11-04T16:03:00Z'),
          ]}
        />
      ),
    },
    'home-paused': {
      title: 'Home: payments paused by the server',
      render: () => <HomeView {...base} gate={{ status: 'blocked', reason: 'payments_paused' }} />,
    },
    'home-loading': {
      title: 'Home: saved payments loading',
      render: () => <HomeView {...base} ready={false} />,
    },
  };
}

function samplePayment(id: string, createdAt: string, extra: Partial<Payment> = {}): Payment {
  return {
    id,
    orderId: `ord_${id}`,
    status: 'confirmed',
    amountCents: 780,
    currency: 'EUR',
    priceGroup: 'student',
    mensa: { id: 'mns_preview', name: 'Mensa am Campus' },
    till: { id: 'till_preview', name: 'Kasse 1' },
    payer: { id: 'usr_preview', displayName: 'Test Student' },
    items: ORDER.items.map((item) => ({ ...item, unitPriceCents: item.unitPriceCents ?? 0 })),
    refundedAmountCents: 0,
    pendingRefundAmountCents: 0,
    refundableAmountCents: 780,
    needsAttention: false,
    attentionReasons: [],
    createdAt,
    updatedAt: createdAt,
    version: 2,
    ...extra,
  };
}

function historyPreviews(): Record<string, Preview> {
  const today = '2026-11-05';
  const payments = [
    samplePayment('pay_a', '2026-11-05T11:02:10Z'),
    samplePayment('pay_b', '2026-11-04T16:03:00Z', {
      status: 'declined',
      refundableAmountCents: 0,
    }),
    samplePayment('pay_c', '2026-11-04T10:52:00Z', {
      refundedAmountCents: 100,
      pendingRefundAmountCents: 50,
      refundableAmountCents: 630,
    }),
    samplePayment('pay_d', '2026-10-30T12:10:00Z', { status: 'pending' }),
  ];
  const unknown = {
    ...sampleIntent('checking', 'unavailable'),
    lastSentAt: Date.parse('2026-11-05T11:20:00Z'),
  };
  const rows = [
    { kind: 'unresolved' as const, intent: unknown },
    ...payments.map((payment) => ({ kind: 'payment' as const, payment })),
  ];
  const list = {
    loading: false,
    hasMore: true,
    hasRows: true,
    failure: null,
    placeOf: () => 'Mensa am Campus',
    onRefresh: noop,
    onRetry: noop,
    onLoadMore: noop,
    onOpenPayment: noop,
    onOpenResult: noop,
    onScan: noop,
  };
  const refunded = payments[2] as Payment;
  const detail: PaymentDetail = {
    ...refunded,
    refunds: [
      {
        id: 'ref_1',
        paymentId: refunded.id,
        amountCents: 100,
        currency: 'EUR',
        status: 'completed',
        reason: null,
        createdAt: '2026-11-04T11:59:00Z',
        updatedAt: '2026-11-04T11:59:30Z',
      },
      {
        id: 'ref_2',
        paymentId: refunded.id,
        amountCents: 50,
        currency: 'EUR',
        status: 'pending',
        reason: 'Coffee was cold',
        createdAt: '2026-11-04T12:20:00Z',
        updatedAt: '2026-11-04T12:20:00Z',
      },
    ],
    history: [
      { at: '2026-11-04T10:52:00Z', type: 'payment_created', amountCents: 780, refundId: null },
      { at: '2026-11-04T10:52:04Z', type: 'payment_confirmed', amountCents: 780, refundId: null },
      { at: '2026-11-04T11:59:00Z', type: 'refund_requested', amountCents: 100, refundId: 'ref_1' },
      { at: '2026-11-04T11:59:30Z', type: 'refund_completed', amountCents: 100, refundId: 'ref_1' },
      { at: '2026-11-04T12:20:00Z', type: 'refund_requested', amountCents: 50, refundId: 'ref_2' },
    ],
  };
  const detailBase = { loading: false, failure: null, onReload: noop };
  return {
    'history-list': {
      title: 'History: unfinished first, by day',
      render: () => <HistoryView {...list} sections={historySections(rows, today)} />,
    },
    'history-offline': {
      title: 'History: offline, earlier rows kept',
      render: () => (
        <HistoryView {...list} failure="offline" sections={historySections(rows.slice(1), today)} />
      ),
    },
    'history-loading': {
      title: 'History: first load',
      render: () => <HistoryView {...list} loading hasRows={false} hasMore={false} sections={[]} />,
    },
    'history-empty': {
      title: 'History: no payments yet',
      render: () => <HistoryView {...list} hasRows={false} hasMore={false} sections={[]} />,
    },
    'detail-refunds': {
      title: 'Detail: refunded, one refund pending',
      render: () => <PaymentDetailView {...detailBase} payment={refunded} detail={detail} />,
    },
    'detail-pending': {
      title: 'Detail: payment being checked',
      render: () => (
        <PaymentDetailView
          {...detailBase}
          payment={payments[3] as Payment}
          detail={{
            ...(payments[3] as Payment),
            refunds: [],
            history: [
              {
                at: '2026-10-30T12:10:00Z',
                type: 'payment_created',
                amountCents: 780,
                refundId: null,
              },
            ],
          }}
        />
      ),
    },
    'detail-offline': {
      title: 'Detail: offline, earlier copy kept',
      render: () => (
        <PaymentDetailView {...detailBase} failure="offline" payment={refunded} detail={detail} />
      ),
    },
    'detail-loading': {
      title: 'Detail: loading',
      render: () => <PaymentDetailView {...detailBase} loading payment={null} detail={null} />,
    },
  };
}

function resultPreviews(): Record<string, Preview> {
  const base = {
    amountCents: 780,
    refusal: null,
    pollState: 'polling' as const,
    payment: null,
    gate: OPEN,
    final: false,
    busy: null,
    message: null,
    onCheckAgain: noop,
    onSendAgain: noop,
    onTryAgain: noop,
    onDetails: null,
    onDone: noop,
  };
  const paid = {
    place: 'Mensa am Campus · Kasse 1',
    createdAt: '2026-11-05T11:02:10Z',
  };
  const states = [
    [
      'result-confirmed',
      'Result: paid',
      'confirmed',
      { payment: paid, final: true, onDetails: noop },
    ],
    ['result-pending', 'Result: being checked', 'pending', { payment: paid }],
    [
      'result-unknown',
      'Result: outcome not known',
      'checking',
      { refusal: 'unavailable', pollState: 'stopped' },
    ],
    [
      'result-unknown-blocked',
      'Result: unknown, availability unknown',
      'checking',
      { gate: BLOCKED, pollState: 'stopped' },
    ],
    ['result-declined', 'Result: declined', 'declined', { payment: paid, final: true }],
    ['result-sending', 'Result: sending', 'sending', {}],
    ['result-not-sent', 'Result: not sent', 'not_sent', { pollState: 'idle' }],
    [
      'result-refused',
      'Result: not paid (expired)',
      'refused',
      { refusal: 'order_expired', final: true },
    ],
  ] as const;
  return Object.fromEntries(
    states.map(([id, title, display, extra]) => [
      id,
      {
        title,
        render: () => (
          <ResultView
            {...base}
            {...extra}
            display={display}
            outcome={describeOutcome(
              sampleIntent(display, 'refusal' in extra ? extra.refusal : null),
            )}
          />
        ),
      },
    ]),
  );
}

/** A payment intent that `describeOutcome` maps to `display`; only its state fields matter here. */
function sampleIntent(display: PaymentDisplay, refusal: string | null): PayOrderIntent {
  const state: Record<PaymentDisplay, PayOrderIntent['state']> = {
    not_sent: 'ready',
    sending: 'submitting',
    checking: 'unknown',
    refused: 'rejected',
    pending: 'applied',
    confirmed: 'applied',
    declined: 'applied',
  };
  const status =
    display === 'pending' || display === 'confirmed' || display === 'declined' ? display : null;
  return {
    v: 1,
    key: 'preview',
    kind: 'payOrder',
    scope: { candidateId: 'preview', userId: 'preview' },
    state: state[display],
    attempts: 1,
    maybeApplied: true,
    firstSentAt: null,
    lastSentAt: null,
    refusal,
    payload: { orderId: 'ord_preview', amountCents: 780 },
    resource: status ? { paymentId: 'pay_preview', status, version: 1 } : null,
  };
}

type ListProps = NativeStackScreenProps<RootStackParamList, 'PaymentStates'>;

/** The list of states; each opens the real view with sample data, in the current language. */
export function PaymentStatesScreen({ navigation }: ListProps) {
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
            onPress={() => navigation.navigate('PaymentStatePreview', { state: id })}
          />
        ))}
      </Card>
    </Screen>
  );
}

type PreviewProps = NativeStackScreenProps<RootStackParamList, 'PaymentStatePreview'>;

export function PaymentStatePreviewScreen({ route }: PreviewProps) {
  const preview = PREVIEWS[route.params.state];
  return preview ? (
    preview.render()
  ) : (
    <Screen>
      <Caption>{route.params.state}</Caption>
    </Screen>
  );
}

export function previewTitle(state: string): string {
  return PREVIEWS[state]?.title ?? state;
}
