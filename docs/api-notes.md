# API notes

Observations against `https://dev.zahln.de` (candidate namespace from the API email), dated per
section. Everything is redacted: no tokens, passwords, user IDs or transaction data.

## Contract copy and live spec

- `packages/api/openapi/openapi.json` is a byte-identical copy of the supplied file
  (SHA-256 `65c44984…e999`). The original stays untouched in the local `brief/` folder.
- Contents, counted from the file: OpenAPI 3.1.0, 10 paths with 10 operations, and 28 component
  schemas.
- `pnpm api:spec-diff` compares the live `https://dev.zahln.de/openapi.json` with the copy after
  parsing. **Result (2026-10-29): semantically identical.** The live file is minified and the supplied
  one is pretty-printed; that is the only difference.

## Smoke check results (`pnpm api:smoke`, 2026-10-29)

| Step                       | Result                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `GET /config`              | 200 in ~90 ms; `paymentsEnabled=true`, `minAppVersion=1.0.0`                                                             |
| `POST /sessions` (student) | 201 in ~70 ms; role `student`, price group `student`; token lifetime 301 s by server clock (300 s + 1 s Date resolution) |
| `GET /mensas` (with token) | 200 in ~30 ms; 3 mensas, 6 tills, 22 menu items, all prices integer cents for student/staff/guest                        |
| `GET /mensas` (no token)   | 401 `application/problem+json`, fields `code, retryable, status, title`, `code=unauthorized`                             |
| Response headers seen      | `alt-svc, content-length, content-type, date, server, vary`                                                              |
| Clock                      | server minus local ≈ −1 s (the `Date` header is truncated to whole seconds)                                              |

All steps passed on the first attempt. **No injected slowness or failure was observed in these runs.**
That says nothing about how the server behaves under its documented failure modes. No hidden chaos
controls are assumed.

## Live writes so far (2026-10-31)

The only writes ever sent to the API are **two `POST /orders`** as the seeded cashier
`cashier-campus-1` (1 × the first menu item of its mensa), sent by `pnpm api:order-probe` to observe
the QR format. **No payment and no refund has been sent.** Payment and refund writes exist only
against the simulated server in the tests.

One order was intended. The second came from a bug: the first run saved its intent with a fractional
`firstSentAt` (from `performance.now()`), the second run could not read that record back and, at the
time, treated the store as empty, so it created a new order with a new key. Fixes: the server clock
returns whole milliseconds, the controller refuses every new action while any saved record of the
user is unreadable, and the test harness uses a fractional monotonic clock so the tests catch it (see
[progress.md](progress.md)). A later run with the unreadable records was refused, as intended; after
the two local records were repaired by hand (`firstSentAt` floored), the next run only read.

Both orders expired unpaid: read back as the cashier on 2026-10-31, each is `expired`, version 1,
without a payment.

## Observed formats (2026-10-31)

- **QR payload**: `zahln://pay?order=<orderId>`. Seen on both probe orders: the order ID occurs once
  and nothing else in the payload is variable (no amount, no signature, no other query keys).
  `parseOrderQr` (`packages/domain/src/qr.ts`) accepts exactly this envelope (scheme `zahln`, host
  `pay`, one `order` parameter) and an ID from `[A-Za-z0-9_-]{1,64}`. The app never opens or fetches the
  scanned text; it loads `GET /orders/{orderId}` from its configured API origin.
- **Order IDs**: `ord_` followed by 16 lowercase letters and digits (20 characters). The parser does
  not require the prefix, so a new ID style would still scan; an unknown ID simply fails to load.
- **Timestamps**: `YYYY-MM-DDTHH:MM:SS.mmmZ` (milliseconds, UTC). `parseTimestamp` accepts ISO 8601
  with any offset and 1–9 fractional digits, and rejects a missing offset or impossible calendar values.
- **Payer IDs**: each seeded payer's own `GET /payments` list (student 32, staff 21, guest 16
  payments, one page each) has `payer.id` equal to the session's `user.id` in every item. The
  recovery search relies on this match.

## CORS

Simulated from Node (`pnpm api:smoke`, 2026-10-29), origins `http://localhost:5173` and
`http://localhost:4173`:

- Preflights return 200, `Access-Control-Allow-Origin: *`, the requested headers echoed back
  (`authorization`, `content-type`, `idempotency-key`, `x-app-version`, `x-candidate-id`), and
  `Access-Control-Max-Age: 600`.
- Actual responses carry `Access-Control-Expose-Headers: Date, Idempotent-Replayed`.

A command-line success does not prove browser CORS, because only a browser enforces it. **Real browser
check:** headless Chrome loaded the production dashboard from `http://localhost:4173/?check`. The
preflighted `GET /config` (custom `X-Candidate-Id` header) succeeded and JavaScript could read
`Date` (`data-server-date-readable="true"`). The deployed dashboard origin must be checked again
once it exists. Every web request carries `X-Candidate-Id`, so every request is preflighted; the 600 s
max-age keeps the extra round trip to roughly one per endpoint every 10 minutes.

## Contract observations and open questions

1. **`X-Candidate-Id` is declared optional** in every operation, but the email requires it on every
   request. The transport always sends it.
2. **`X-App-Version` is not a declared parameter.** It is mentioned only in the payment description
   ("a version below `minAppVersion` is refused with 426"), and only `POST /orders/{orderId}/payments`
   lists 426 and `payments_disabled`. So the version and maintenance gates concern the payer app; the
   till shows no gate, because its own version blocks nothing. The native apps send `X-App-Version`
   on every request from `expo.version` (1.0.0).
3. **Response headers are undocumented**: neither `Idempotent-Replayed` nor `Date` appears in the
   response definitions, although the description relies on both (and CORS exposes both).
4. **503 on `POST /orders/{id}/payments` lists only `payments_disabled`**, while the overview says any
   request can fail with `503 unavailable` before anything happens. The client branches on `code`,
   never on the status alone (`classifyWrite` in `packages/domain/src/write-outcome.ts`).
5. **Problem bodies** have `code`, `title`, `status`, `retryable` and optional `detail`. There is no
   `type`/`instance` (optional in RFC 9457) and no request ID header for support correlation.
   `retryable` is not used to decide whether a write happened.
6. **Sessions**: tokens last 5 minutes, there is no refresh token and no logout endpoint, so re-login
   needs the credentials again. `SessionCoordinator` keeps the seeded account's password in memory and
   logs the same account in again on `401 session_expired`. **That is a mock-specific mechanism**; a
   production app would need refresh tokens or a device-bound credential.
7. **Order expiry does not grow `version`** (seen on both probe orders: `open` v1 → `expired` v1). The
   contract says `Order.version` "grows with every change". The client accepts exactly this change at
   an equal version (`isLaterOrderState` in `packages/domain/src/versioning.ts`) and nothing else, so a
   stale `open` read still cannot replace `expired`. **Open:** whether payment settlement
   (`pending` → `confirmed`/`declined`) grows the payment's version has not been observed, because no
   live payment has been made. Check it with the first real payment; if it does not, the same kind of
   rule is needed for payments.
8. **`q` on `GET /payments` is a prefix search** ("Search by payment or order ID prefix"). Recovery
   therefore checks every hit for the exact `orderId`, the payer and the amount.
9. **No way to find a write whose response was lost, other than replaying it**: there is no order list
   for a till and no lookup by idempotency key. A lost `POST /orders` or `POST …/refunds` response is
   recoverable only by a same-key replay inside the 24-hour retention. Refunds are not matched by
   amount, reason or time, because two refunds can share all three.

## Notes the payment design depends on

- **PIN / biometric proof.** No endpoint verifies a PIN or biometric result; `POST …/payments` needs
  only the bearer token. Local biometric/PIN confirmation is therefore a device-side gate, not proof the
  server can check. Production would need server-verifiable step-up authentication (for example a
  device-bound key signing a challenge, as strong customer authentication requires).
- **Idempotency retention.** Keys are kept 24 hours per user. The client replays a saved intent only
  while less than 23 hours of server time have passed since its first attempt
  (`REPLAY_WINDOW_MS`); after that, or when server time is unknown, it only reads. It relies on the
  server honouring the documented retention: a replay inside it returns the original result. Orders
  expire after 5 minutes, but a payment can stay `pending` for minutes, so recovery works from reads
  as well as replays.
- **Server time.** The `Date` header has whole-second precision, so the client keeps server time as a
  bounded interval and decides expiry and replay age on the safe side of it. The device clock is not
  used.
- **Unversioned reports.** `DailyTotals` has no `version`, ETag or "generated at". The HTTP `Date`
  header is when the response was sent, **not** when the report data was computed, so it must not be
  shown as "as of". The dashboard should show a "last fetched at" time instead, and not present a day
  as final. Totals may appear to move backwards between reads. Payments count on the day they were
  made and refunds on the day they completed, both in Europe/Berlin.
- **CSV limitations.** There is no export endpoint. The dashboard must page through `GET /payments`
  (`limit` ≤ 200, `cursor`) for the selected filter and include every page, de-duplicating by payment
  ID (keeping the highest `version`) in case pages shift while new payments arrive. `from`/`to` need
  ISO timestamps with offset, computed for Europe/Berlin days, which are 23 or 25 hours long on DST
  change days. List items have no refund list or history; a full-history export would need one
  `GET /payments/{id}` per row.

## What we would change in the API (draft for the design document)

- Declare `X-Candidate-Id` (required), `X-App-Version`, `Idempotent-Replayed` and `Date` in the spec.
- Grow `Order.version` on expiry, as the contract says, or document `status` as derived from time.
- Let a client look up a write by its idempotency key (or list a till's recent orders), so a lost
  response can be recovered after the retention window too.
- Offer an exact `orderId` filter on `GET /payments` next to the prefix search.
- Give reports a version or ETag and a generated-at timestamp; offer a server-side CSV export.
- Specify the `qrPayload` format and add a signature or checksum, so a scanner can reject foreign codes.
- Add refresh tokens and a request ID header; make step-up payment authorization server-verifiable.
