import { mergeHistory, PaymentHistory, type HistoryEntry, type HistoryState } from '@mensa/domain';
import { formatBerlinDateTime, formatCents } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { paymentStatusText } from '../components/payment-text';
import { Body, Button, Notice, StatusBadge } from '../components/ui';
import type { RootStackParamList } from '../navigation';
import { describeOutcome } from '../payment-outcome';
import { useControllerRevision, usePaymentServices } from '../payments/PaymentServices';

type Props = NativeStackScreenProps<RootStackParamList, 'History'>;
const EMPTY: HistoryState = { ids: [], loading: false, hasMore: false, failure: null };

/**
 * The payer's payments, newest first, with the actions still waiting for an answer on top. Pages
 * load only when asked ("Load more"), and the screen says when more exist. Works while new payments
 * are blocked (paused, update required): it only reads.
 */
export function HistoryScreen({ navigation }: Props) {
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const { api, controller } = usePaymentServices();
  useControllerRevision(controller);
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

  const rows = controller ? mergeHistory(state.ids, controller.cache, controller.list()) : [];

  function renderRow({ item }: { item: HistoryEntry }) {
    if (item.kind === 'unresolved') {
      const outcome = describeOutcome(item.intent);
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityHint={t('home.openResult')}
          onPress={() => navigation.navigate('Result', { key: item.intent.key })}
          className="min-h-touch gap-1 rounded-card bg-surface p-4 active:opacity-80"
        >
          <StatusBadge tone={outcome.tone} label={t(outcome.title)} />
          <Text className="text-base text-ink">
            {formatCents(item.intent.payload.amountCents, locale)}
          </Text>
          <Body muted>{t('history.unresolved')}</Body>
        </Pressable>
      );
    }
    const { payment } = item;
    const status = paymentStatusText(payment.status);
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityHint={t('history.openDetail')}
        onPress={() => navigation.navigate('PaymentDetail', { paymentId: payment.id })}
        className="min-h-touch gap-1 rounded-card bg-surface p-4 active:opacity-80"
      >
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <Text className="text-lg font-semibold text-ink">{payment.mensa.name}</Text>
          <Text className="text-lg font-semibold text-ink">
            {formatCents(payment.amountCents, locale)}
          </Text>
        </View>
        <StatusBadge tone={status.tone} label={t(status.key)} />
        <Body muted>{formatBerlinDateTime(payment.createdAt, locale)}</Body>
      </Pressable>
    );
  }

  return (
    <FlatList
      className="flex-1 bg-canvas"
      contentContainerClassName="gap-3 px-4 pt-4"
      contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
      data={rows}
      keyExtractor={(row) => (row.kind === 'payment' ? row.payment.id : row.intent.key)}
      renderItem={renderRow}
      refreshControl={
        <RefreshControl
          refreshing={state.loading && state.ids.length > 0}
          onRefresh={() => void history?.refresh()}
        />
      }
      ListHeaderComponent={
        <View className="gap-2">
          <Text accessibilityRole="header" className="text-2xl font-bold text-ink">
            {t('history.title')}
          </Text>
          <Body muted>{t('history.timeZone')}</Body>
          {state.failure ? (
            <Notice tone="error" title={t(`history.failure.${state.failure}`)}>
              <Button
                label={t('common.retry')}
                onPress={() =>
                  void (state.ids.length > 0 ? history?.loadMore() : history?.refresh())
                }
              />
            </Notice>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        state.loading ? (
          <Notice tone="neutral" title={t('history.loading')} />
        ) : state.failure ? null : (
          <Notice tone="neutral" title={t('history.empty')} />
        )
      }
      ListFooterComponent={
        state.hasMore ? (
          <View className="gap-2">
            <Body muted>{t('history.more')}</Body>
            <Button
              tone="secondary"
              label={t('history.loadMore')}
              busy={state.loading}
              onPress={() => void history?.loadMore()}
            />
          </View>
        ) : state.ids.length > 0 && !state.loading ? (
          <Body muted>{t('history.complete')}</Body>
        ) : null
      }
    />
  );
}
