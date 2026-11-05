import { colors } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import { Text, View } from 'react-native';
import { Button, Caption, Card, EmptyState, Icon, tabularFigures } from './ui';

/**
 * The order being put together. No total is shown: the price depends on who pays, and the server
 * decides it once the payer scans (it shows each group's total after the order is created).
 */
export function BasketPanel(props: {
  lines: { itemId: string; name: string; quantity: number }[];
  count: number;
  creating: boolean;
  /** False while saved orders are still being read, or nothing can be created. */
  ready: boolean;
  /** False on a phone, where the create action sits in the bottom bar instead. */
  showCreate: boolean;
  onCreate: () => void;
  onClear: () => void;
}) {
  const { t } = useI18n();
  const empty = props.lines.length === 0;
  return (
    <Card title={t('checkout.basket')}>
      {empty ? (
        <EmptyState
          icon="basket-outline"
          title={t('checkout.basketEmptyTitle')}
          description={t('checkout.basketEmpty')}
        />
      ) : (
        <View>
          {props.lines.map((line, index) => (
            <View
              key={line.itemId}
              accessible
              accessibilityLabel={t('checkout.quantity', {
                name: line.name,
                quantity: line.quantity,
              })}
              className={`min-h-touch flex-row items-center gap-3 py-2 ${index > 0 ? 'border-t border-line-subtle' : ''}`}
            >
              <View className="h-8 min-w-10 items-center justify-center rounded-full bg-brand-subtle px-2">
                <Text
                  className="text-caption font-bold text-brand-strong"
                  style={tabularFigures.text}
                >
                  {line.quantity}×
                </Text>
              </View>
              <Text className="flex-1 text-body text-ink">{line.name}</Text>
            </View>
          ))}
          <View className="border-t border-line-subtle pt-2">
            <Caption>{t('checkout.count', { count: props.count })}</Caption>
          </View>
        </View>
      )}
      <View className="flex-row gap-2">
        <View className="h-5 justify-center">
          <Icon name="information-circle-outline" size="sm" color={colors.inkMuted} />
        </View>
        <View className="flex-1">
          <Caption>{t('checkout.priceNote')}</Caption>
        </View>
      </View>
      {props.showCreate ? (
        <Button
          icon="qr-code-outline"
          label={t('checkout.create')}
          busy={props.creating}
          disabled={empty || !props.ready}
          onPress={props.onCreate}
        />
      ) : null}
      {!empty ? (
        <Button
          tone="tertiary"
          icon="trash-outline"
          label={t('checkout.clear')}
          disabled={props.creating}
          onPress={props.onClear}
        />
      ) : null}
    </Card>
  );
}
