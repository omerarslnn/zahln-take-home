import type { MenuItem, Order } from '@mensa/api';
import {
  addItem,
  canAdd,
  canCloseUnshownOrder,
  expiryState,
  isFinal,
  quantityOf,
  removeItem,
  type Basket,
  type CreateOrderIntent,
  type NotAllowedReason,
} from '@mensa/domain';
import { formatCents, type MessageKey } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LanguageSwitch } from '../components/Foundation';
import { OrderQr } from '../components/OrderQr';
import { orderStatusText, priceGroupKey } from '../components/payment-text';
import { Body, Button, Card, Notice, StatusPill, useAnnouncement } from '../components/ui';
import type { TillStackParamList } from '../navigation';
import {
  useControllerRevision,
  usePaymentServices,
  useServerNow,
} from '../payments/PaymentServices';
import { usePaymentDetail } from '../payments/usePaymentDetail';
import { useTill } from '../useTill';

type Props = NativeStackScreenProps<TillStackParamList, 'Checkout'>;

/**
 * Keeps a column one group for screen readers. Android lifts the contents of plain containers into
 * one list sorted by screen position, so side by side the order panel's controls fell between the
 * menu rows. iOS already groups the children of every React Native view for VoiceOver.
 */
const SCREEN_READER_GROUP = { collapsable: false, importantForAccessibility: 'yes' } as const;

/**
 * Ring up an order, show its QR, and follow it until the server says paid or expired. The checkout
 * (the order intent) is separate from the create request: an order that exists is still waiting
 * for its payer, so the menu comes back only after `paid` or `expired` and an explicit "Next
 * customer". There is no cancel endpoint, so an open order simply runs out (5 minutes).
 */
export function CheckoutScreen({ navigation }: Props) {
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= 768;
  const { user, controller, recordsUnavailable, signOut } = usePaymentServices();
  useControllerRevision(controller);
  const { mensa, till, failure: tillFailure, reload } = useTill();
  const [basket, setBasket] = useState<Basket>([]);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<MessageKey | null>(null);

  // At most one: a new order intent replaces the acknowledged one.
  const checkout = controller
    ?.list()
    .find((record): record is CreateOrderIntent => record.kind === 'createOrder');

  async function createOrder() {
    if (!controller || basket.length === 0 || creating) return;
    setCreating(true);
    setMessage(null);
    const outcome = await controller.createOrder([...basket]);
    setCreating(false);
    if (outcome.type === 'submitted' || outcome.type === 'existing') setBasket([]);
    else if (outcome.type === 'conflict') setMessage('checkout.finishFirst');
    else if (outcome.type === 'not_allowed') setMessage(createRefusal(outcome.reason));
    else if (outcome.type === 'storage_failed') setMessage('checkout.storageFailed');
  }

  const header = (
    <View className="flex-row flex-wrap items-center justify-between gap-3">
      <View className="gap-1">
        <Text accessibilityRole="header" className="text-2xl font-bold text-ink">
          {mensa && till ? `${mensa.name} · ${till.name}` : t('till.title')}
        </Text>
        <Body muted>{t('till.signedInAs', { name: user?.displayName ?? '' })}</Body>
      </View>
      <View className="flex-row flex-wrap gap-2">
        <Button
          tone="secondary"
          label={t('till.nav.payments')}
          onPress={() => navigation.navigate('Payments')}
        />
        <Button tone="secondary" label={t('till.switchAccount')} onPress={signOut} />
      </View>
    </View>
  );

  const menu =
    mensa && !checkout ? (
      <MenuCard
        items={mensa.menu}
        basket={basket}
        onAdd={(id) => setBasket((current) => addItem(current, id))}
        onRemove={(id) => setBasket((current) => removeItem(current, id))}
      />
    ) : null;

  const side = checkout ? (
    <CheckoutPanel record={checkout} qrSize={Math.min(wide ? 380 : width - 64, 420)} />
  ) : (
    <Card title={t('checkout.basket')}>
      {basket.length === 0 ? <Body muted>{t('checkout.basketEmpty')}</Body> : null}
      {basket.map((line) => (
        <Text key={line.itemId} className="text-base text-ink">
          {line.quantity} × {itemName(mensa?.menu, line.itemId, locale)}
        </Text>
      ))}
      <Body muted>{t('checkout.priceNote')}</Body>
      <Button
        label={t('checkout.create')}
        busy={creating}
        disabled={basket.length === 0 || !controller}
        onPress={() => void createOrder()}
      />
      {basket.length > 0 ? (
        <Button tone="secondary" label={t('checkout.clear')} onPress={() => setBasket([])} />
      ) : null}
    </Card>
  );

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="gap-4 p-4"
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    >
      {header}
      {recordsUnavailable ? (
        <Notice
          tone="error"
          title={t('home.recordsUnavailable.title')}
          description={t('home.recordsUnavailable.body')}
        />
      ) : !controller ? (
        <Notice tone="neutral" title={t('home.loadingRecords')} />
      ) : null}
      {tillFailure ? (
        <Notice
          tone="error"
          title={t(`till.failure.${tillFailure}`)}
          actions={<Button label={t('common.retry')} onPress={() => void reload()} />}
        />
      ) : null}
      {message ? <Notice tone="warning" title={t(message)} /> : null}

      <View className={wide ? 'flex-row items-start gap-4' : 'gap-4'}>
        {menu ? (
          <View className={wide ? 'flex-1' : ''} {...SCREEN_READER_GROUP}>
            {menu}
          </View>
        ) : null}
        <View className={wide ? 'flex-1' : ''} {...SCREEN_READER_GROUP}>
          {side}
        </View>
      </View>

      <LanguageSwitch />
      <Button
        tone="secondary"
        label={t('nav.diagnostics')}
        onPress={() => navigation.navigate('Diagnostics')}
      />
    </ScrollView>
  );
}

function MenuCard(props: {
  items: MenuItem[];
  basket: Basket;
  onAdd: (itemId: string) => void;
  onRemove: (itemId: string) => void;
}) {
  const { t, locale } = useI18n();
  return (
    <Card title={t('checkout.menu')}>
      {props.items.map((item) => {
        const quantity = quantityOf(props.basket, item.id);
        const name = item.name[locale];
        return (
          <View key={item.id} className="gap-2 border-t border-line pt-3">
            <Text className="text-lg font-semibold text-ink">{name}</Text>
            <Text className="text-base text-ink-muted">
              {(['student', 'staff', 'guest'] as const)
                .map(
                  (group) =>
                    `${t(priceGroupKey(group))} ${formatCents(item.prices[group], locale)}`,
                )
                .join(' · ')}
            </Text>
            <View className="flex-row items-center gap-3">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('checkout.remove', { name })}
                accessibilityState={{ disabled: quantity === 0 }}
                disabled={quantity === 0}
                onPress={() => props.onRemove(item.id)}
                className={`min-h-touch min-w-touch items-center justify-center rounded-control border-2 border-brand bg-surface ${quantity === 0 ? 'opacity-50' : ''}`}
              >
                <Text className="text-2xl font-bold text-brand">−</Text>
              </Pressable>
              <Text
                accessibilityLabel={t('checkout.quantity', { name, quantity })}
                className="min-w-touch text-center text-xl font-semibold text-ink"
              >
                {quantity}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('checkout.add', { name })}
                accessibilityState={{ disabled: !canAdd(props.basket, item.id) }}
                disabled={!canAdd(props.basket, item.id)}
                onPress={() => props.onAdd(item.id)}
                className={`min-h-touch min-w-touch items-center justify-center rounded-control bg-brand ${canAdd(props.basket, item.id) ? '' : 'opacity-50'}`}
              >
                <Text className="text-2xl font-bold text-brand-on">+</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </Card>
  );
}

/** The order being taken: its QR while it can be paid, then the server's result. */
function CheckoutPanel({ record, qrSize }: { record: CreateOrderIntent; qrSize: number }) {
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

function itemName(menu: MenuItem[] | undefined, itemId: string, locale: 'de' | 'en'): string {
  return menu?.find((item) => item.id === itemId)?.name[locale] ?? itemId;
}

function createRefusal(reason: NotAllowedReason): MessageKey {
  if (reason === 'server_time_unknown') return 'notAllowed.serverTime';
  if (reason === 'unreadable_records') return 'notAllowed.unreadable';
  return 'notAllowed.other';
}
