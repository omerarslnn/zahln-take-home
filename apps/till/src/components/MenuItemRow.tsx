import type { MenuItem } from '@mensa/api';
import { colors, formatCents } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { priceGroupKey } from './payment-text';
import { Icon, tabularFigures } from './ui';

const GROUPS = ['student', 'staff', 'guest'] as const;

/**
 * One dish: its name, the server's price for each group, and − / quantity / + controls (56 dp, so
 * they are easy to hit in a rush). A dish in the basket is tinted and its quantity is in the brand
 * colour. Screen readers hear the dish and its prices as one phrase, then each control.
 * Memoised: a tap re-renders only the rows whose quantity or availability changed.
 */
export const MenuItemRow = memo(function MenuItemRow({
  item,
  quantity,
  canAdd,
  onAdd,
  onRemove,
  separated,
}: {
  item: MenuItem;
  quantity: number;
  canAdd: boolean;
  onAdd: (itemId: string) => void;
  onRemove: (itemId: string) => void;
  separated: boolean;
}) {
  const { t, locale } = useI18n();
  const name = item.name[locale];
  const prices = GROUPS.map((group) => ({
    group,
    label: t(priceGroupKey(group)),
    price: formatCents(item.prices[group], locale),
  }));
  const chosen = quantity > 0;
  return (
    <View
      className={`flex-row flex-wrap items-center gap-3 px-4 py-3 ${separated ? 'border-t border-line-subtle' : ''} ${chosen ? 'bg-brand-subtle' : 'bg-surface'}`}
    >
      <View
        accessible
        accessibilityLabel={[name, ...prices.map((p) => `${p.label} ${p.price}`)].join(', ')}
        className="min-w-40 flex-1 gap-1"
      >
        <Text className="text-body font-semibold text-ink">{name}</Text>
        <View className="flex-row flex-wrap gap-x-4 gap-y-1">
          {prices.map((p) => (
            <Text key={p.group} className="text-caption text-ink-muted">
              {p.label}{' '}
              <Text className="font-semibold text-ink" style={tabularFigures.text}>
                {p.price}
              </Text>
            </Text>
          ))}
        </View>
      </View>
      <View className="flex-row items-center gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('checkout.remove', { name })}
          accessibilityState={{ disabled: quantity === 0 }}
          disabled={quantity === 0}
          onPress={() => onRemove(item.id)}
          className={`h-14 w-14 items-center justify-center rounded-control border ${quantity === 0 ? 'border-fill bg-fill' : 'border-brand bg-surface active:bg-brand-subtle'}`}
        >
          <Icon name="remove" size="lg" color={quantity === 0 ? colors.inkMuted : colors.brand} />
        </Pressable>
        <Text
          accessibilityLabel={t('checkout.quantity', { name, quantity })}
          className={`min-w-10 text-center text-headline font-bold ${chosen ? 'text-brand-strong' : 'text-ink-muted'}`}
          style={tabularFigures.text}
        >
          {quantity}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('checkout.add', { name })}
          accessibilityState={{ disabled: !canAdd }}
          disabled={!canAdd}
          onPress={() => onAdd(item.id)}
          className={`h-14 w-14 items-center justify-center rounded-control ${canAdd ? 'bg-brand active:bg-brand-strong' : 'bg-fill'}`}
        >
          <Icon name="add" size="lg" color={canAdd ? colors.brandOn : colors.inkMuted} />
        </Pressable>
      </View>
    </View>
  );
});
