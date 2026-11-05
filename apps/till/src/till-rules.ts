// The till screen's display rules, as pure functions so they are tested without React Native.
// Nothing here decides money: prices and totals are always the server's.
import type { MenuItem, OrderStatus } from '@mensa/api';
import type { Basket } from '@mensa/domain';
import { parseEuroAmount, type Locale } from '@mensa/shared';

/**
 * Keep the screen on only while a payer may still scan the code: the order is open (or its payment
 * is being checked), the checkout is the screen in front and the app is in the foreground. Paid,
 * expired, unresolved or no order: the device's normal sleep applies again.
 */
export function keepAwakeWanted(state: {
  focused: boolean;
  appActive: boolean;
  status: OrderStatus | null;
}): boolean {
  return state.focused && state.appActive && (state.status === 'open' || state.status === 'paying');
}

/** The QR code's side in points: as large as the space allows, within limits that scan well. */
export function qrSide(available: number, wide: boolean): number {
  const max = wide ? 560 : 420;
  return Math.max(200, Math.floor(Math.min(available, max)));
}

/** How many dishes the basket holds (a count, never an amount). */
export function basketCount(basket: Basket): number {
  return basket.reduce((sum, line) => sum + line.quantity, 0);
}

/** The basket's lines with their dish names in the current language, in the order added. */
export function basketLines(
  basket: Basket,
  menu: readonly MenuItem[],
  locale: Locale,
): { itemId: string; name: string; quantity: number }[] {
  return basket.map((line) => ({
    itemId: line.itemId,
    name: menu.find((item) => item.id === line.itemId)?.name[locale] ?? line.itemId,
    quantity: line.quantity,
  }));
}

/** What the refund form says about the typed amount; the server's refundable amount is the cap. */
export type RefundAmountCheck =
  | { ok: true; cents: number }
  | {
      ok: false;
      /** Shown under the field; null while the field is empty (nothing to complain about yet). */
      error:
        | { key: 'empty' | 'invalid' | 'too_precise' | 'zero' | 'too_large' }
        | { key: 'tooMuch'; refundableCents: number }
        | null;
    };

/**
 * Checks a typed refund amount: euros with a comma or a point and at most two decimals (the shared
 * parser), more than zero, and no more than the server's `refundableAmountCents`, which already
 * reserves refunds still being processed. Only an `ok` amount can go on to the confirmation.
 */
export function checkRefundAmount(text: string, refundableCents: number): RefundAmountCheck {
  const parsed = parseEuroAmount(text);
  if (!parsed.ok) return { ok: false, error: text === '' ? null : { key: parsed.reason } };
  if (parsed.cents > refundableCents) {
    return { ok: false, error: { key: 'tooMuch', refundableCents } };
  }
  return { ok: true, cents: parsed.cents };
}

/** Cents as the refund field expects them ("4,40" in German, "4.40" in English). */
export function refundInputText(cents: number, locale: Locale): string {
  const separator = locale === 'de' ? ',' : '.';
  return `${Math.floor(cents / 100)}${separator}${String(cents % 100).padStart(2, '0')}`;
}
