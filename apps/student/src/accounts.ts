import type { MessageKey } from '@mensa/shared';
import type { IconName } from './components/ui';

/**
 * The mock API's seeded payer accounts (OpenAPI description, "Seeded logins"), offered as one-tap
 * demo accounts. Usernames and descriptions only: the published password is attached by
 * `PaymentServices`, and the server decides who the user is and which prices they pay.
 */
export const DEMO_ACCOUNTS: readonly {
  username: string;
  title: MessageKey;
  detail: MessageKey;
  icon: IconName;
}[] = [
  {
    username: 'student',
    title: 'signIn.demo.student',
    detail: 'signIn.demo.student.detail',
    icon: 'school-outline',
  },
  {
    username: 'staff',
    title: 'signIn.demo.staff',
    detail: 'signIn.demo.staff.detail',
    icon: 'briefcase-outline',
  },
  {
    username: 'guest',
    title: 'signIn.demo.guest',
    detail: 'signIn.demo.guest.detail',
    icon: 'person-outline',
  },
];
