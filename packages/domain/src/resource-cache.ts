import type { Order, Payment, PaymentDetail } from '@mensa/api';
import { isLaterOrderState, newerOf } from './versioning';

/**
 * The newest known copy of each order and payment for one scope. Every response (write result,
 * polling read, list item, detail) passes through `newerOf` (orders: `isLaterOrderState`), so a
 * stale or out-of-order response never replaces newer information.
 *
 * Details are a separate projection. A list item and a detail with the same version describe the
 * same state, but only the detail carries refunds and history; `newerOf` keeps the first copy on a
 * tie, so storing details separately is what keeps history from being lost.
 */
export class ResourceCache {
  private readonly orders = new Map<string, Order>();
  private readonly payments = new Map<string, Payment>();
  private readonly details = new Map<string, PaymentDetail>();

  /** `onChange` runs when a put actually replaced what is stored (not for an ignored stale copy). */
  constructor(private readonly onChange: () => void = () => undefined) {}

  /** Orders also accept an expiry at an equal version (see `isLaterOrderState`). */
  putOrder(order: Order): Order {
    const known = this.orders.get(order.id);
    const kept = !known || isLaterOrderState(known, order) ? order : known;
    this.store(this.orders, order.id, kept);
    return kept;
  }

  putPayment(payment: Payment): Payment {
    const kept = newerOf(this.payments.get(payment.id), payment);
    this.store(this.payments, payment.id, kept);
    return kept;
  }

  /** Stores the detail projection and updates the summary from it. Returns the newest summary. */
  putPaymentDetail(detail: PaymentDetail): Payment {
    this.store(this.details, detail.id, newerOf(this.details.get(detail.id), detail));
    return this.putPayment(detail);
  }

  private store<T>(map: Map<string, T>, id: string, value: T): void {
    if (map.get(id) === value) return;
    map.set(id, value);
    this.onChange();
  }

  order(id: string): Order | undefined {
    return this.orders.get(id);
  }

  /**
   * A payment for display: the newest summary, plus the detail when it is at least as new. A detail
   * older than the summary is withheld (`detailOutdated`) rather than shown as current history.
   */
  paymentView(
    id: string,
  ): { payment: Payment; detail: PaymentDetail | null; detailOutdated: boolean } | null {
    const payment = this.payments.get(id);
    if (!payment) return null;
    const detail = this.details.get(id) ?? null;
    const current = detail !== null && detail.version >= payment.version;
    return {
      payment,
      detail: current ? detail : null,
      detailOutdated: detail !== null && !current,
    };
  }
}
