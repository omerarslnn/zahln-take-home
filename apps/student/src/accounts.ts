import type { PriceGroup } from '@mensa/api';

/**
 * The mock API's seeded payer accounts (OpenAPI description, "Seeded logins"). The same order costs
 * a different amount for each price group; the server resolves it. Usernames only: the password is
 * attached by `PaymentServices`, and the session decides who the user really is.
 */
export const TEST_ACCOUNTS: readonly { username: string; group: PriceGroup }[] = [
  { username: 'student', group: 'student' },
  { username: 'staff', group: 'staff' },
  { username: 'guest', group: 'guest' },
];
