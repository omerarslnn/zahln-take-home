export type QrParseResult =
  { ok: true; orderId: string } | { ok: false; reason: 'not_an_order_code' | 'invalid_order_id' };

// Observed from the live API on 2026-10-31 (one cashier order): `zahln://pay?order=<orderId>`,
// with order IDs like `ord_` + 16 lowercase letters and digits. The envelope is matched exactly;
// the ID is bounded to a safe alphabet but its prefix is not required, so a new ID style on the
// server would still scan (an unknown ID simply fails to load).
const ORDER_CODE = /^zahln:\/\/pay\?order=([^&#]*)$/i;
const ORDER_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Parses a scanned till QR code into an order ID.
 *
 * The code identifies the order only: it carries no amount, and an amount from a code is never
 * trusted. The app never fetches or opens the scanned text; it loads `GET /orders/{orderId}` from
 * its own configured API origin, which returns the amount for the signed-in payer's price group.
 * Parsed by hand rather than with `URL`, whose React Native implementation handles custom schemes
 * inconsistently.
 */
export function parseOrderQr(scanned: string): QrParseResult {
  const match = ORDER_CODE.exec(scanned.trim());
  if (!match) return { ok: false, reason: 'not_an_order_code' };
  const orderId = match[1] ?? '';
  return ORDER_ID.test(orderId) ? { ok: true, orderId } : { ok: false, reason: 'invalid_order_id' };
}

/**
 * A code typed by hand, for people who cannot aim a camera (or have not allowed it): the QR text,
 * or just the order ID that the till prints under the QR. Anything else is refused, and the result
 * is used the same way: as an ID to load from the configured API, never as a link or an amount.
 */
export function parseOrderCode(typed: string): QrParseResult {
  const text = typed.trim();
  if (/^zahln:/i.test(text)) return parseOrderQr(text);
  return ORDER_ID.test(text)
    ? { ok: true, orderId: text }
    : { ok: false, reason: 'invalid_order_id' };
}
