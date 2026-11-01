import { parseCalendarDay } from '@mensa/shared';
import { filterFromParams, filterToParams, type TransactionFilter } from './finance/filters';

// Hash routes (#/transactions?status=pending): the dashboard is a static bundle, and with the
// route after '#', a deep link or a reload works on any static host without rewrite rules.

export type Route =
  | { page: 'report'; day: string | null }
  | { page: 'attention' }
  | { page: 'transactions'; filter: TransactionFilter }
  | { page: 'payment'; paymentId: string; back: string | null }
  | { page: 'diagnostics' }
  | { page: 'not_found' };

const PAYMENT_ID = /^[A-Za-z0-9_-]{1,100}$/;

export function parseRoute(hash: string): Route {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const queryStart = raw.indexOf('?');
  const path = queryStart === -1 ? raw : raw.slice(0, queryStart);
  const params = new URLSearchParams(queryStart === -1 ? '' : raw.slice(queryStart + 1));
  const [section, id, extra] = path.split('/').filter(Boolean);
  if (extra !== undefined) return { page: 'not_found' };
  switch (section) {
    case undefined:
    case 'report': {
      const day = params.get('day');
      return { page: 'report', day: day && parseCalendarDay(day) ? day : null };
    }
    case 'attention':
      return { page: 'attention' };
    case 'transactions':
      return { page: 'transactions', filter: filterFromParams(params) };
    case 'payments': {
      // `back` returns to the list the payment was opened from; only an in-app route is accepted.
      const back = params.get('back');
      return id && PAYMENT_ID.test(id)
        ? { page: 'payment', paymentId: id, back: back?.startsWith('#/') ? back : null }
        : { page: 'not_found' };
    }
    case 'diagnostics':
      return { page: 'diagnostics' };
    default:
      return { page: 'not_found' };
  }
}

export function routeHref(route: Route): string {
  switch (route.page) {
    case 'report':
      return route.day ? `#/report?day=${route.day}` : '#/report';
    case 'attention':
      return '#/attention';
    case 'transactions': {
      const query = filterToParams(route.filter).toString();
      return query ? `#/transactions?${query}` : '#/transactions';
    }
    case 'payment': {
      const back = route.back ? `?${new URLSearchParams({ back: route.back }).toString()}` : '';
      return `#/payments/${route.paymentId}${back}`;
    }
    case 'diagnostics':
      return '#/diagnostics';
    case 'not_found':
      return '#/report';
  }
}
