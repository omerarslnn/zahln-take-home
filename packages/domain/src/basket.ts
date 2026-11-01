/** Limits from the contract's `CreateOrder`: 1–20 lines, quantity 1–20 per line. */
export const MAX_BASKET_LINES = 20;
export const MAX_LINE_QUANTITY = 20;

export type Basket = readonly { itemId: string; quantity: number }[];

/**
 * The till's basket. It holds item IDs and quantities only, never prices or totals: what an order
 * costs depends on who pays, and the server resolves it (per group for the cashier, the payer's own
 * amount for the payer). Pure functions; the screen keeps the basket in state.
 */
export function addItem(basket: Basket, itemId: string): Basket {
  const line = basket.find((entry) => entry.itemId === itemId);
  if (!line) {
    return basket.length >= MAX_BASKET_LINES ? basket : [...basket, { itemId, quantity: 1 }];
  }
  if (line.quantity >= MAX_LINE_QUANTITY) return basket;
  return basket.map((entry) =>
    entry.itemId === itemId ? { ...entry, quantity: entry.quantity + 1 } : entry,
  );
}

/** One less of an item; the line disappears at zero. */
export function removeItem(basket: Basket, itemId: string): Basket {
  return basket.flatMap((entry) => {
    if (entry.itemId !== itemId) return [entry];
    return entry.quantity > 1 ? [{ ...entry, quantity: entry.quantity - 1 }] : [];
  });
}

/** Whether one more of an item fits within the limits. */
export function canAdd(basket: Basket, itemId: string): boolean {
  const line = basket.find((entry) => entry.itemId === itemId);
  return line ? line.quantity < MAX_LINE_QUANTITY : basket.length < MAX_BASKET_LINES;
}

export function quantityOf(basket: Basket, itemId: string): number {
  return basket.find((entry) => entry.itemId === itemId)?.quantity ?? 0;
}
