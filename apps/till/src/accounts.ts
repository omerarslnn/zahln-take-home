/**
 * The mock API's seeded cashier accounts (OpenAPI description, "Seeded logins"), offered as one-tap
 * demo accounts and grouped by the mensa the description names for each. That place is only a
 * hint: the session decides the real mensa and till, and the till never sends a till ID, so a
 * cashier cannot ring up orders for another till.
 */
export const CASHIER_LOCATIONS: readonly {
  place: string;
  cashiers: readonly { username: string; number: number }[];
}[] = [
  {
    place: 'Mensa am Campus',
    cashiers: [
      { username: 'cashier-campus-1', number: 1 },
      { username: 'cashier-campus-2', number: 2 },
      { username: 'cashier-campus-3', number: 3 },
    ],
  },
  {
    place: 'Mensa Nord',
    cashiers: [
      { username: 'cashier-nord-1', number: 1 },
      { username: 'cashier-nord-2', number: 2 },
    ],
  },
  {
    place: 'Cafeteria Bibliothek',
    cashiers: [{ username: 'cashier-bibliothek-1', number: 1 }],
  },
];
