import type { Payment } from '@mensa/api';
import { PaymentHistory, type HistoryFailure, type HistoryState } from '@mensa/domain';
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
import {
  Button,
  Caption,
  EmptyState,
  IconButton,
  ListRow,
  LoadingIndicator,
  Notice,
  Skeleton,
  Tag,
  TextField,
} from '../components/ui';
import {
  historySections,
  paymentRowText,
  type HistorySection,
  type SectionTitle,
} from '../history-sections';
import type { TillStackParamList } from '../navigation';
import { useControllerRevision, usePaymentServices } from '../payments/PaymentServices';

type Props = NativeStackScreenProps<TillStackParamList, 'Payments'>;
const EMPTY: HistoryState = { ids: [], loading: false, hasMore: false, failure: null };

/** The Berlin day of now: server time when the till has learned it, else the device clock. */
const berlinToday = () => berlinDateKey(new Date(serverClock.now()?.latest ?? Date.now()));

/**
 * This till's payments, newest first and grouped by Berlin day (the server scopes the list to the
 * cashier's till; no other till's payment is ever listed), with a search by the start of a payment,
 * order or payer ID. The entry to refunds.
 */
export function PaymentsScreen({ navigation }: Props) {
  const { api, controller } = usePaymentServices();
  const revision = useControllerRevision(controller);
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const history = useMemo(
    () =>
      api && controller
        ? new PaymentHistory(
            (query) => api.listPayments(query),
            controller.cache,
            search ? { q: search } : {},
          )
        : null,
    [api, controller, search],
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

  const [today] = useState(berlinToday);
  // Recomputed when the list or a cached payment changes (`revision`), not on every render.
  const sections = useMemo(() => {
    const rows = state.ids.flatMap((id) => {
      const payment = controller?.cache.paymentView(id)?.payment;
      return payment ? [{ kind: 'payment' as const, payment }] : [];
    });
    return historySections(rows, today);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `revision` marks a cache change
  }, [controller, state.ids, revision, today]);
  const openPayment = useCallback(
    (paymentId: string) => navigation.navigate('PaymentDetail', { paymentId }),
    [navigation],
  );

  return (
    <PaymentsView
      sections={sections}
      loading={state.loading}
      hasMore={state.hasMore}
      hasRows={state.ids.length > 0}
      failure={state.failure}
      typed={typed}
      search={search}
      onType={setTyped}
      onSearch={() => setSearch(typed.trim())}
      onClearSearch={() => {
        setTyped('');
        setSearch('');
      }}
      onRefresh={() => void history?.refresh()}
      onRetry={() => void (state.ids.length > 0 ? history?.loadMore() : history?.refresh())}
      onLoadMore={() => void history?.loadMore()}
      onOpenPayment={openPayment}
    />
  );
}

export interface PaymentsViewProps {
  sections: HistorySection[];
  loading: boolean;
  hasMore: boolean;
  hasRows: boolean;
  failure: HistoryFailure | null;
  typed: string;
  /** The search in effect (what was submitted), empty for all payments. */
  search: string;
  onType: (text: string) => void;
  onSearch: () => void;
  onClearSearch: () => void;
  onRefresh: () => void;
  onRetry: () => void;
  onLoadMore: () => void;
  onOpenPayment: (paymentId: string) => void;
}

/**
 * The till's payments: a search by ID, then a heading per Berlin day and the day's payments in one
 * grouped card. Pull to refresh; older pages on request; a failed refresh keeps the rows and says
 * so above them.
 */
export function PaymentsView(props: PaymentsViewProps) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const empty = props.sections.length === 0;

  return (
    <SectionList
      className="flex-1 bg-canvas"
      contentContainerClassName="px-4 pt-4"
      contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
      keyboardShouldPersistTaps="handled"
      sections={props.sections}
      keyExtractor={(row) => (row.kind === 'payment' ? row.payment.id : row.intent.key)}
      stickySectionHeadersEnabled={false}
      renderSectionHeader={({ section }) => <DayHeading title={section.title} />}
      renderItem={({ item, index, section }) =>
        item.kind === 'payment' ? (
          <GroupedCell first={index === 0} last={index === section.data.length - 1}>
            <TillPaymentRow
              payment={item.payment}
              separated={index > 0}
              onOpen={props.onOpenPayment}
            />
          </GroupedCell>
        ) : null
      }
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
          <TextField
            label={t('till.payments.searchLabel')}
            hint={t('till.payments.searchHint')}
            value={props.typed}
            onChangeText={props.onType}
            onSubmitEditing={props.onSearch}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            returnKeyType="search"
            placeholder={t('till.payments.searchPlaceholder')}
            trailing={
              <IconButton
                icon="search"
                label={t('till.payments.search')}
                onPress={props.onSearch}
              />
            }
          />
          {props.search ? (
            <View className="flex-row flex-wrap items-center gap-2">
              <Tag icon="search" label={t('till.payments.searching', { q: props.search })} />
              <Button
                tone="tertiary"
                icon="close"
                label={t('till.payments.clearSearch')}
                onPress={props.onClearSearch}
              />
            </View>
          ) : null}
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
          <PaymentsLoading />
        ) : props.failure ? null : (
          <EmptyState
            icon={props.search ? 'search' : 'receipt-outline'}
            title={t(props.search ? 'till.payments.noMatch' : 'till.payments.empty')}
            description={t(props.search ? 'till.payments.noMatchBody' : 'till.payments.emptyBody')}
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

function DayHeading({ title }: { title: SectionTitle }) {
  const { t, locale } = useI18n();
  const text =
    title.kind === 'today'
      ? t('history.today')
      : title.kind === 'yesterday'
        ? t('history.yesterday')
        : title.kind === 'day'
          ? formatCalendarDay(title.day, locale)
          : t('history.attention');
  return (
    <View className="pb-2 pt-4">
      <Text accessibilityRole="header" className="text-body font-semibold text-ink">
        {text}
      </Text>
    </View>
  );
}

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

/** One payment of this till; memoised on the server's copy, like the student's history rows. */
const TillPaymentRow = memo(function TillPaymentRow({
  payment,
  separated,
  onOpen,
}: {
  payment: Payment;
  separated: boolean;
  onOpen: (paymentId: string) => void;
}) {
  const { t, locale } = useI18n();
  const text = paymentRowText(payment, t, locale, 'till');
  return (
    <ListRow
      title={text.title}
      status={text.status}
      value={text.value}
      subtitle={text.subtitle}
      hint={t('till.payments.openHint')}
      separated={separated}
      onPress={() => onOpen(payment.id)}
    />
  );
});

function PaymentsLoading() {
  const { t } = useI18n();
  return (
    <View className="gap-3 pt-4">
      <Skeleton width="25%" height={16} />
      <View className="gap-4 rounded-card border border-line-subtle bg-surface p-4">
        {[0, 1, 2, 3].map((index) => (
          <View key={index} className="flex-row items-center gap-3">
            <View className="flex-1 gap-2">
              <Skeleton width="45%" height={16} />
              <Skeleton width="70%" height={14} />
            </View>
            <Skeleton width={64} height={16} />
          </View>
        ))}
      </View>
      <LoadingIndicator label={t('history.loading')} />
    </View>
  );
}
