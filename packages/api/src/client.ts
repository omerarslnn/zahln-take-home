import type { Transport, TransportResult } from './transport';
import type { AppConfig, LoginRequest, MensaList, Session } from './types';

/**
 * Typed wrappers for the endpoints the foundation uses. Order, payment and refund writes are
 * deliberately absent: they arrive in stage 2 together with persisted idempotency keys.
 */
export interface ApiClient {
  /** GET /config: public remote configuration (minimum app version, payments switch). */
  getConfig(): Promise<TransportResult<AppConfig>>;
  /** POST /sessions: logs in a seeded user. The returned token lasts at most 5 minutes. */
  createSession(credentials: LoginRequest): Promise<TransportResult<Session>>;
  /** GET /mensas: mensas with their tills and menus (prices in cents per price group). */
  listMensas(accessToken: string): Promise<TransportResult<MensaList>>;
}

export function createApiClient(transport: Transport): ApiClient {
  return {
    getConfig: () => transport.request<AppConfig>({ method: 'GET', path: '/config' }),
    createSession: (credentials) =>
      transport.request<Session>({ method: 'POST', path: '/sessions', body: credentials }),
    listMensas: (accessToken) =>
      transport.request<MensaList>({ method: 'GET', path: '/mensas', accessToken }),
  };
}
