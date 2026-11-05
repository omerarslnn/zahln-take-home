import type { Mensa, Till } from '@mensa/api';
import {
  addItem,
  canAdd,
  quantityOf,
  removeItem,
  type Basket,
  type CreateOrderIntent,
  type NotAllowedReason,
} from '@mensa/domain';
import { colors, type MessageKey } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { FlatList, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActiveOrder } from '../components/ActiveOrder';
import { BasketPanel } from '../components/BasketPanel';
import { MenuItemRow } from '../components/MenuItemRow';
import {
  BottomActionBar,
  Button,
  Caption,
  Heading,
  Icon,
  IconButton,
  LoadingIndicator,
  Notice,
  Skeleton,
  Title,
} from '../components/ui';
import type { TillStackParamList } from '../navigation';
import { useControllerRevision, usePaymentServices } from '../payments/PaymentServices';
import { basketCount, basketLines } from '../till-rules';
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
  const { user, controller, recordsUnavailable, signOut } = usePaymentServices();
  useControllerRevision(controller);
  const { mensa, till, failure: tillFailure, reload } = useTill();
  const { width } = useWindowDimensions();
  const [basket, setBasket] = useState<Basket>([]);
  const [creating, setCreating] = useState(false);
  // Answers a second tap before React has re-rendered the busy button; the controller refuses a
  // second order intent as well.
  const creatingNow = useRef(false);
  const [message, setMessage] = useState<MessageKey | null>(null);

  // At most one: a new order intent replaces the acknowledged one.
  const checkout = controller
    ?.list()
    .find((record): record is CreateOrderIntent => record.kind === 'createOrder');

  // Stable, so a tap re-renders only the menu rows whose quantity changed.
  const add = useCallback((itemId: string) => setBasket((current) => addItem(current, itemId)), []);
  const remove = useCallback(
    (itemId: string) => setBasket((current) => removeItem(current, itemId)),
    [],
  );

  async function createOrder() {
    if (!controller || basket.length === 0 || creatingNow.current) return;
    creatingNow.current = true;
    setCreating(true);
    setMessage(null);
    try {
      const outcome = await controller.createOrder([...basket]);
      if (outcome.type === 'submitted' || outcome.type === 'existing') setBasket([]);
      else if (outcome.type === 'conflict') setMessage('checkout.finishFirst');
      else if (outcome.type === 'not_allowed') setMessage(createRefusal(outcome.reason));
      else if (outcome.type === 'storage_failed') setMessage('checkout.storageFailed');
    } finally {
      creatingNow.current = false;
      setCreating(false);
    }
  }

  return (
    <CheckoutView
      mensa={mensa}
      till={till}
      cashier={user?.displayName ?? ''}
      menuFailure={tillFailure}
      recordsUnavailable={recordsUnavailable}
      ready={controller !== null}
      basket={basket}
      creating={creating}
      message={message}
      activeOrder={checkout ? <ActiveOrder record={checkout} wide={width >= 768} /> : null}
      onAdd={add}
      onRemove={remove}
      onCreate={() => void createOrder()}
      onClear={() => setBasket([])}
      onRetryMenu={() => void reload()}
      onPayments={() => navigation.navigate('Payments')}
      onSwitchCashier={signOut}
      onDiagnostics={() => navigation.navigate('Diagnostics')}
    />
  );
}

export interface CheckoutViewProps {
  mensa: Mensa | null;
  till: Till | null;
  cashier: string;
  menuFailure: 'offline' | 'session' | 'error' | 'unassigned' | null;
  recordsUnavailable: boolean;
  /** The saved orders have been read: a new order can start. */
  ready: boolean;
  basket: Basket;
  creating: boolean;
  message: MessageKey | null;
  /** The order being taken, shown instead of the menu until "Next customer". */
  activeOrder: ReactNode | null;
  onAdd: (itemId: string) => void;
  onRemove: (itemId: string) => void;
  onCreate: () => void;
  onClear: () => void;
  onRetryMenu: () => void;
  onPayments: () => void;
  onSwitchCashier: () => void;
  onDiagnostics: () => void;
}

/**
 * The till's main screen. Tablet (768 dp and wider): the menu on the left and the order on the
 * right, each scrolling on its own, so the order and its button stay in view while the menu
 * scrolls. Phone: one column, with the create action in the bottom bar.
 */
export function CheckoutView(props: CheckoutViewProps) {
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= 768;
  const menu = props.mensa?.menu ?? [];
  const lines = basketLines(props.basket, menu, locale);
  const count = basketCount(props.basket);

  const header = (
    <TillHeader
      title={
        props.mensa && props.till ? `${props.mensa.name} · ${props.till.name}` : t('till.title')
      }
      cashier={props.cashier}
      onPayments={props.onPayments}
      onSwitchCashier={props.onSwitchCashier}
      onDiagnostics={props.onDiagnostics}
    />
  );
  const notices = (
    <Notices
      recordsUnavailable={props.recordsUnavailable}
      ready={props.ready}
      menuFailure={props.menuFailure}
      message={props.message}
      onRetryMenu={props.onRetryMenu}
    />
  );
  const basketPanel = (compact: boolean) => (
    <BasketPanel
      lines={lines}
      count={count}
      creating={props.creating}
      ready={props.ready}
      showCreate={!compact}
      onCreate={props.onCreate}
      onClear={props.onClear}
    />
  );

  if (props.activeOrder) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top }}>
        {header}
        <ScrollView
          contentContainerClassName="gap-4 px-4 pt-2"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        >
          {notices}
          {props.activeOrder}
        </ScrollView>
      </View>
    );
  }

  const menuList = (listHeader: ReactNode, listFooter: ReactNode) => (
    <FlatList
      data={props.mensa ? menu : []}
      keyExtractor={(item) => item.id}
      extraData={props.basket}
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="px-4"
      contentContainerStyle={{ paddingBottom: wide ? insets.bottom + 24 : 24 }}
      ListHeaderComponent={
        <View className="gap-4 pb-3">
          {listHeader}
          <Heading>{t('checkout.menu')}</Heading>
        </View>
      }
      renderItem={({ item, index }) => (
        <MenuCell first={index === 0} last={index === menu.length - 1}>
          <MenuItemRow
            item={item}
            quantity={quantityOf(props.basket, item.id)}
            canAdd={canAdd(props.basket, item.id)}
            onAdd={props.onAdd}
            onRemove={props.onRemove}
            separated={index > 0}
          />
        </MenuCell>
      )}
      ListEmptyComponent={props.menuFailure ? null : <MenuLoading />}
      ListFooterComponent={listFooter ? <View className="pt-4">{listFooter}</View> : null}
    />
  );

  if (wide) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top }}>
        {header}
        <View className="flex-1 flex-row gap-2">
          <View className="flex-[3]" {...SCREEN_READER_GROUP}>
            {menuList(notices, null)}
          </View>
          <View className="flex-[2]" {...SCREEN_READER_GROUP}>
            <ScrollView
              contentContainerClassName="pr-4"
              contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            >
              {basketPanel(false)}
            </ScrollView>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top }}>
      {menuList(
        <>
          {header}
          {notices}
        </>,
        basketPanel(true),
      )}
      {count > 0 ? (
        <BottomActionBar>
          <Caption>{t('checkout.count', { count })}</Caption>
          <Button
            icon="qr-code-outline"
            label={t('checkout.create')}
            busy={props.creating}
            disabled={!props.ready}
            onPress={props.onCreate}
          />
        </BottomActionBar>
      ) : null}
    </View>
  );
}

/** The till's identity and its secondary actions, above the menu and order. */
function TillHeader(props: {
  title: string;
  cashier: string;
  onPayments: () => void;
  onSwitchCashier: () => void;
  onDiagnostics: () => void;
}) {
  const { t } = useI18n();
  return (
    <View className="flex-row flex-wrap items-center gap-3 px-4 pb-3 pt-4">
      {/* The mark and the till's name stay together (at least 320 dp); on a narrower screen the
          actions move below them. */}
      <View className="min-w-80 flex-1 flex-row items-center gap-3">
        <View className="h-12 w-12 items-center justify-center rounded-card bg-brand">
          <Icon name="storefront" size="lg" color={colors.brandOn} />
        </View>
        <View className="flex-1 gap-0.5">
          <Title>{props.title}</Title>
          <Caption>{t('till.signedInAs', { name: props.cashier })}</Caption>
        </View>
      </View>
      <View className="flex-row flex-wrap items-center gap-2">
        <Button
          tone="secondary"
          icon="receipt-outline"
          label={t('till.nav.payments')}
          onPress={props.onPayments}
        />
        <Button
          tone="tertiary"
          icon="swap-horizontal-outline"
          label={t('till.switchAccount')}
          onPress={props.onSwitchCashier}
        />
        <IconButton
          icon="construct-outline"
          label={t('nav.diagnostics')}
          onPress={props.onDiagnostics}
        />
      </View>
    </View>
  );
}

function Notices(props: {
  recordsUnavailable: boolean;
  ready: boolean;
  menuFailure: CheckoutViewProps['menuFailure'];
  message: MessageKey | null;
  onRetryMenu: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      {props.recordsUnavailable ? (
        <Notice
          tone="error"
          title={t('home.recordsUnavailable.title')}
          description={t('home.recordsUnavailable.body')}
        />
      ) : !props.ready ? (
        <LoadingIndicator label={t('home.loadingRecords')} />
      ) : null}
      {props.menuFailure ? (
        <Notice
          tone="error"
          title={t(`till.failure.${props.menuFailure}`)}
          actions={<Button label={t('common.retry')} onPress={props.onRetryMenu} />}
        />
      ) : null}
      {props.message ? <Notice tone="warning" title={t(props.message)} /> : null}
    </>
  );
}

/** One menu row inside the menu's card: the card outline is drawn by its first and last rows. */
function MenuCell({
  first,
  last,
  children,
}: {
  first: boolean;
  last: boolean;
  children: ReactNode;
}) {
  return (
    <View
      className={`overflow-hidden border-x border-line-subtle bg-surface ${first ? 'rounded-t-card border-t' : ''} ${last ? 'rounded-b-card border-b' : ''}`}
    >
      {children}
    </View>
  );
}

/** Placeholders in the shape of menu rows, with one spoken "Loading the menu". */
function MenuLoading() {
  const { t } = useI18n();
  return (
    <View className="gap-3">
      <View className="gap-4 rounded-card border border-line-subtle bg-surface p-4">
        {[0, 1, 2, 3].map((index) => (
          <View key={index} className="flex-row items-center gap-3">
            <View className="flex-1 gap-2">
              <Skeleton width="55%" height={18} />
              <Skeleton width="80%" height={14} />
            </View>
            <Skeleton width={56} height={56} />
            <Skeleton width={56} height={56} />
          </View>
        ))}
      </View>
      <LoadingIndicator label={t('checkout.menuLoading')} />
    </View>
  );
}

function createRefusal(reason: NotAllowedReason): MessageKey {
  if (reason === 'server_time_unknown') return 'notAllowed.serverTime';
  if (reason === 'unreadable_records') return 'notAllowed.unreadable';
  return 'notAllowed.other';
}
