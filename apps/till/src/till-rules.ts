// The till screen's display rules, as pure functions so they are tested without React Native.
// Nothing here decides money: prices and totals are always the server's.
import type { MenuItem, OrderStatus } from '@mensa/api';
import type { Basket } from '@mensa/domain';
import type { Locale } from '@mensa/shared';

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
