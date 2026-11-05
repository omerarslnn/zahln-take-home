import type { Payment } from '@mensa/api';
import {
  mergeHistory,
  PaymentHistory,
  type HistoryEntry,
  type HistoryFailure,
  type HistoryState,
  type PayOrderIntent,
} from '@mensa/domain';
import { berlinDateKey, colors, formatCalendarDay } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { RefreshControl, SectionList, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { serverClock } from '../api';
import { actionPlace, PaymentActionRow } from '../components/PaymentActionRow';
import {
  Button,
  Caption,
  EmptyState,
  ListRow,
  LoadingIndicator,
  Notice,
  Skeleton,
} from '../components/ui';
import {
  historySections,
  paymentRowText,
  type HistorySection,
  type SectionTitle,
} from '../history-sections';
import type { RootStackParamList } from '../navigation';
import { useControllerRevision, usePaymentServices } from '../payments/PaymentServices';

type Props = NativeStackScreenProps<RootStackParamList, 'History'>;
const EMPTY: HistoryState = { ids: [], loading: false, hasMore: false, failure: null };

/** The Berlin day of now: server time when this phone has learned it, else the device clock. */
const berlinToday = () => berlinDateKey(new Date(serverClock.now()?.latest ?? Date.now()));

/**
 * The payer's payments, newest first and grouped by Berlin day, with the actions still waiting for
 * an answer on top. Pages load only when asked ("Load older payments"), and the list says when more
 * exist. Works while new payments are blocked (paused, update required): it only reads. Rows that
 * were loaded stay on screen when a refresh fails.
 */
export function HistoryScreen({ navigation }: Props) {
  const { api, controller } = usePaymentServices();
  const revision = useControllerRevision(controller);
  const history = useMemo(
    () =>
      api && controller
        ? new PaymentHistory((query) => api.listPayments(query), controller.cache)
        : null,
    [api, controller],
  );
  const state = useSyncExternalStore(
    useCallback(
      (listener: () => void) => history?.subscribe(listener) ?? (() => undefined),
      [history],
    ),
    () => history?.state() ?? EMPTY,
  );
  useEffect(() => {
    void history?.refresh();
    return () => history?.dispose();
  }, [history]);

  // Read once when the screen opens: "Today" and "Yesterday" relabel when it is opened again.
  const [today] = useState(berlinToday);
  // Recomputed when the list or a cached payment changes (`revision`), not on every render.
  const sections = useMemo(() => {
    if (!controller) return [];
    return historySections(mergeHistory(state.ids, controller.cache, controller.list()), today);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `revision` marks a cache change
  }, [controller, state.ids, revision, today]);

  const openPayment = useCallback(
    (paymentId: string) => navigation.navigate('PaymentDetail', { paymentId }),
    [navigation],
  );
  const openResult = useCallback(
    (key: string) => navigation.navigate('Result', { key }),
    [navigation],
  );

  return (
    <HistoryView
      sections={sections}
      loading={state.loading}
      hasMore={state.hasMore}
      hasRows={state.ids.length > 0}
      failure={state.failure}
      placeOf={(intent) => (controller ? actionPlace(controller, intent) : undefined)}
      onRefresh={() => void history?.refresh()}
      onRetry={() => void (state.ids.length > 0 ? history?.loadMore() : history?.refresh())}
      onLoadMore={() => void history?.loadMore()}
      onOpenPayment={openPayment}
      onOpenResult={openResult}
      onScan={() => navigation.navigate('Scan')}
    />
  );
}

export interface HistoryViewProps {
  sections: HistorySection[];
  loading: boolean;
  hasMore: boolean;
  /** The server returned at least one page with payments. */
  hasRows: boolean;
  failure: HistoryFailure | null;
  placeOf: (intent: PayOrderIntent) => string | undefined;
  onRefresh: () => void;
  onRetry: () => void;
  onLoadMore: () => void;
  onOpenPayment: (paymentId: string) => void;
  onOpenResult: (key: string) => void;
  onScan: () => void;
}

/**
 * The history list: a day heading per Berlin day and the day's payments in one grouped card, the
 * unfinished ones first. Pull to refresh; older pages on request; a failed refresh keeps the rows
 * and says so above them.
 */
export function HistoryView(props: HistoryViewProps) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const empty = props.sections.length === 0;

  const renderItem = ({
    item,
    index,
    section,
  }: {
    item: HistoryEntry;
    index: number;
    section: HistorySection;
  }) => (
    <GroupedCell first={index === 0} last={index === section.data.length - 1}>
      {item.kind === 'payment' ? (
        <HistoryPaymentRow
          payment={item.payment}
          separated={index > 0}
          onOpen={props.onOpenPayment}
        />
      ) : (
        <PaymentActionRow
          record={item.intent}
          place={props.placeOf(item.intent)}
          separated={index > 0}
          onPress={() => props.onOpenResult(item.intent.key)}
        />
      )}
    </GroupedCell>
  );

  return (
    <SectionList
      className="flex-1 bg-canvas"
      contentContainerClassName="px-4 pt-4"
      contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
      sections={props.sections}
      keyExtractor={(row) => (row.kind === 'payment' ? row.payment.id : row.intent.key)}
      renderItem={renderItem}
      renderSectionHeader={({ section }) => <DayHeading title={section.title} />}
      stickySectionHeadersEnabled={false}
      refreshControl={
        <RefreshControl
          refreshing={props.loading && props.hasRows}
          onRefresh={props.onRefresh}
          colors={[colors.brand]}
          tintColor={colors.brand}
        />
      }
      ListHeaderComponent={
        <View className="gap-3 pb-1">
          <Caption>{t('history.timeZone')}</Caption>
          {props.failure ? (
            <Notice
              tone="error"
              title={t(`history.failure.${props.failure}`)}
              actions={<Button label={t('common.retry')} onPress={props.onRetry} />}
            />
          ) : null}
        </View>
      }
      ListEmptyComponent={
        props.loading ? (
          <HistoryLoading />
        ) : props.failure ? null : (
          <EmptyState
            icon="receipt-outline"
            title={t('history.empty')}
            description={t('history.emptyBody')}
            action={
              <Button icon="qr-code-outline" label={t('home.scan.title')} onPress={props.onScan} />
            }
          />
        )
      }
      ListFooterComponent={
        empty ? null : props.hasMore ? (
          <View className="gap-2 pt-4">
            <Caption>{t('history.more')}</Caption>
            <Button
              tone="secondary"
              label={t('history.loadMore')}
              busy={props.loading}
              onPress={props.onLoadMore}
            />
          </View>
        ) : props.hasRows && !props.loading ? (
          <View className="items-center pt-4">
            <Caption>{t('history.complete')}</Caption>
          </View>
        ) : null
      }
    />
  );
}

/** A section heading: the attention group, "Today", "Yesterday" or the weekday and date. */
function DayHeading({ title }: { title: SectionTitle }) {
  const { t, locale } = useI18n();
  const text =
    title.kind === 'attention'
      ? t('history.attention')
      : title.kind === 'today'
        ? t('history.today')
        : title.kind === 'yesterday'
          ? t('history.yesterday')
          : formatCalendarDay(title.day, locale);
  return (
    <View className="gap-1 pb-2 pt-4">
      <Text accessibilityRole="header" className="text-body font-semibold text-ink">
        {text}
      </Text>
      {title.kind === 'attention' ? <Caption>{t('history.unresolved')}</Caption> : null}
    </View>
  );
}

/** One row of a day's grouped card: the card's outline is drawn by its first and last rows. */
function GroupedCell({
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
      className={`border-x border-line-subtle bg-surface px-4 ${first ? 'rounded-t-card border-t' : ''} ${last ? 'rounded-b-card border-b' : ''}`}
    >
      {children}
    </View>
  );
}

/**
 * A server payment as a row. Memoised: it renders again only when the server sends a newer copy of
 * this payment (the cache then holds a new object) or the language changes, not when the list
 * around it grows.
 */
const HistoryPaymentRow = memo(function HistoryPaymentRow({
  payment,
  separated,
  onOpen,
}: {
  payment: Payment;
  separated: boolean;
  onOpen: (paymentId: string) => void;
}) {
  const { t, locale } = useI18n();
  const text = paymentRowText(payment, t, locale);
  return (
    <ListRow
      title={text.title}
      status={text.status}
      value={text.value}
      subtitle={text.subtitle}
      hint={t('history.openDetail')}
      separated={separated}
      onPress={() => onOpen(payment.id)}
    />
  );
});

/** Placeholders in the shape of a day of payments, with one spoken "Loading payments". */
export function HistoryLoading() {
  const { t } = useI18n();
  return (
    <View className="gap-3 pt-4">
      <Skeleton width="30%" height={16} />
      <View className="gap-4 rounded-card border border-line-subtle bg-surface p-4">
        {[0, 1, 2].map((index) => (
          <View key={index} className="flex-row items-center gap-3">
            <View className="flex-1 gap-2">
              <Skeleton width="60%" height={16} />
              <Skeleton width="35%" height={14} />
            </View>
            <Skeleton width={56} height={16} />
          </View>
        ))}
      </View>
      <LoadingIndicator label={t('history.loading')} />
    </View>
  );
}
