// Building blocks of the order review and the payment detail: where, what, how long. They only
// display what the server sent; no amount is calculated here.
import { colors, formatCents } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import type { Ref } from 'react';
import { Text, View } from 'react-native';
import { countdownText, countdownTone } from '../order-countdown';
import { Button, Caption, Icon, Tag, TONE, Title } from './ui';

/**
 * The mensa as the screen's title and the till under it, read together as one element. `ref` lets
 * the review move screen-reader focus here once the order has loaded.
 */
export function MerchantHeader({
  mensa,
  till,
  ref,
}: {
  mensa: string;
  till: string;
  ref?: Ref<View>;
}) {
  return (
    <View ref={ref} accessible className="flex-row items-center gap-3">
      <View className="h-12 w-12 items-center justify-center rounded-card bg-brand-subtle">
        <Icon name="restaurant-outline" size="lg" color={colors.brand} />
      </View>
      <View className="flex-1 gap-0.5">
        <Title>{mensa}</Title>
        <Caption>{till}</Caption>
      </View>
    </View>
  );
}

/** "2 × Pasta" with "€5.00 each" under it, read as "2 times Pasta, €5.00 each". Server prices. */
export function OrderItemRow({
  quantity,
  name,
  unitPriceCents,
  separated,
}: {
  quantity: number;
  name: string;
  unitPriceCents: number | null;
  separated?: boolean;
}) {
  const { t, locale } = useI18n();
  const price = unitPriceCents != null ? formatCents(unitPriceCents, locale) : null;
  return (
    <View
      accessible
      accessibilityLabel={
        price
          ? t('payment.itemLine', { quantity, name, price })
          : t('payment.itemLineNoPrice', { quantity, name })
      }
      className={`min-h-touch flex-row items-center gap-3 py-2 ${separated ? 'border-t border-line-subtle' : ''}`}
    >
      <View className="h-8 min-w-8 items-center justify-center rounded-full bg-canvas px-2">
        <Text className="text-caption font-semibold text-ink">{quantity}×</Text>
      </View>
      {/* The price sits under the name, so a long German dish name keeps the full width and
          never breaks inside a word at large text sizes. */}
      <View className="flex-1 gap-0.5">
        <Text className="text-body text-ink">{name}</Text>
        {price ? <Caption>{t('payment.each', { price })}</Caption> : null}
      </View>
    </View>
  );
}

/**
 * Time left to pay, from the server clock: a calm tag, a warning in the last minute. Not a live
 * region, so screen readers are not interrupted every second; they read it when they reach it.
 */
export function CountdownTag({ secondsLeft }: { secondsLeft: number }) {
  const { t } = useI18n();
  const tone = countdownTone(secondsLeft);
  const label = t('review.expiresIn', { time: countdownText(secondsLeft) });
  if (tone === 'neutral') return <Tag icon="time-outline" label={label} />;
  const style = TONE.warning;
  return (
    <View
      className={`flex-row items-center gap-1 self-start rounded-full border px-3 py-1 ${style.pill} ${style.border}`}
    >
      <Icon name="time-outline" size="sm" color={style.iconColor} />
      <Text className={`shrink text-caption font-semibold ${style.text}`}>{label}</Text>
    </View>
  );
}

/**
 * The review's one primary action, in the bottom bar: "Pay €5.00", and under it how the payer will
 * confirm it on this device. The note is hidden from screen readers, which hear it as the button's
 * hint instead, so it is not read twice.
 */
export function PayAction({
  label,
  busy,
  onPress,
}: {
  label: string;
  busy: boolean;
  onPress: () => void;
}) {
  const { t } = useI18n();
  return (
    <View className="gap-2">
      <Button
        label={label}
        icon="finger-print"
        hint={t('review.payHint')}
        busy={busy}
        onPress={onPress}
      />
      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        className="flex-row items-center justify-center gap-1"
      >
        <Icon name="lock-closed-outline" size="sm" color={colors.inkMuted} />
        <Caption>{t('review.payHint')}</Caption>
      </View>
    </View>
  );
}
