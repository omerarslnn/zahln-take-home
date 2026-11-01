import { PaymentHistory, type HistoryState } from '@mensa/domain';
import { formatBerlinDateTime, formatCents } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { paymentStatusText } from '../components/payment-text';
import { Body, Button, Notice, StatusBadge } from '../components/ui';
import type { TillStackParamList } from '../navigation';
import { useControllerRevision, usePaymentServices } from '../payments/PaymentServices';

type Props = NativeStackScreenProps<TillStackParamList, 'Payments'>;
const EMPTY: HistoryState = { ids: [], loading: false, hasMore: false, failure: null };

/**
 * This till's payments, newest first (the server scopes the list to the cashier's till), with a
 * search by the start of a payment, order or payer ID. The entry to refunds.
 */
export function PaymentsScreen({ navigation }: Props) {
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const { api, controller } = usePaymentServices();
  useControllerRevision(controller);
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

  const payments = state.ids.flatMap((id) => controller?.cache.paymentView(id)?.payment ?? []);

  return (
    <FlatList
      className="flex-1 bg-canvas"
      contentContainerClassName="gap-3 px-4 pt-4"
      contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
      keyboardShouldPersistTaps="handled"
      data={payments}
      keyExtractor={(payment) => payment.id}
      refreshControl={
        <RefreshControl
          refreshing={state.loading && state.ids.length > 0}
          onRefresh={() => void history?.refresh()}
        />
      }
      renderItem={({ item: payment }) => {
        const status = paymentStatusText(payment.status);
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityHint={t('history.openDetail')}
            onPress={() => navigation.navigate('PaymentDetail', { paymentId: payment.id })}
            className="min-h-touch gap-1 rounded-card bg-surface p-4 active:opacity-80"
          >
            <View className="flex-row flex-wrap items-center justify-between gap-2">
              <Text className="text-lg font-semibold text-ink">{payment.payer.displayName}</Text>
              <Text className="text-lg font-semibold text-ink">
                {formatCents(payment.amountCents, locale)}
              </Text>
            </View>
            <StatusBadge tone={status.tone} label={t(status.key)} />
            <Body muted>
              {formatBerlinDateTime(payment.createdAt, locale)} · {payment.id}
            </Body>
          </Pressable>
        );
      }}
      ListHeaderComponent={
        <View className="gap-3">
          <Text accessibilityRole="header" className="text-2xl font-bold text-ink">
            {t('till.payments.title')}
          </Text>
          <Body muted>{t('history.timeZone')}</Body>
          <View className="flex-row flex-wrap items-center gap-2">
            <TextInput
              value={typed}
              onChangeText={setTyped}
              onSubmitEditing={() => setSearch(typed.trim())}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel={t('till.payments.searchLabel')}
              placeholder={t('till.payments.searchPlaceholder')}
              className="min-h-touch flex-1 rounded-control border-2 border-line bg-surface px-3 text-base text-ink"
            />
            <Button label={t('till.payments.search')} onPress={() => setSearch(typed.trim())} />
          </View>
          {search ? <Body muted>{t('till.payments.searching', { q: search })}</Body> : null}
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
          <Notice tone="neutral" title={t(search ? 'till.payments.noMatch' : 'history.empty')} />
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
