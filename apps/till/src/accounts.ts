/**
 * The mock API's seeded cashier accounts (OpenAPI description, "Seeded logins"), with the place
 * the description names for each as a hint. The session decides the real mensa and till: the till
 * never sends a till ID, so a cashier cannot ring up orders for another till.
 */
export const CASHIER_ACCOUNTS: readonly { username: string; place: string }[] = [
  { username: 'cashier-campus-1', place: 'Mensa am Campus' },
  { username: 'cashier-campus-2', place: 'Mensa am Campus' },
  { username: 'cashier-campus-3', place: 'Mensa am Campus' },
  { username: 'cashier-nord-1', place: 'Mensa Nord' },
  { username: 'cashier-nord-2', place: 'Mensa Nord' },
  { username: 'cashier-bibliothek-1', place: 'Cafeteria Bibliothek' },
];
