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

## Live writes ledger

Every write sent to the mock (candidate `c_5b3ceacafb`) by the scripts and the test runs in this
repository. All went through the intent mechanism: saved with its idempotency key before sending,
reused on a retry. Local evidence: `.local/` (git-ignored). Not itemized: the owner's physical-device
tests on 2026-11-04 (payments, orders and refunds; see [progress.md](progress.md), Phase 0) and on
2026-11-05 (one payment in the Phase 4 checks; orders, payments, partial and full refunds and an
expired order in the Phase 5 checks). Phases 2–6 made no scripted or emulator write: their emulator
runs only read and signed in.

| When (Berlin)     | Who                       | Write                                                   | Resource                                       | Result                                         |
| ----------------- | ------------------------- | ------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| 2026-10-31 11:3x  | cashier-campus-1          | order (probe)                                           | 2 orders, see below                            | both expired unpaid (v1)                       |
| 2026-10-31 ~18:59 | cashier-campus-1, student | order + payment (`pnpm api:payment-probe`)              | `ord_71832f7697fe562d`, `pay_650a13b0311ad6fe` | confirmed, 250 cents (student)                 |
| 2026-10-31 22:27  | cashier-campus-2          | order (till app, iteration build)                       | `ord_5dda3faa7e8d5ab4`                         | expired unpaid (used for the price-group read) |
| 2026-11-01 11:53  | cashier-campus-2, staff   | order + payment (till and student apps, release builds) | `ord_ebb99f6c6bd7186a`, `pay_90d914f2be37a714` | confirmed, 580 cents (staff)                   |
| 2026-11-01 12:06  | cashier-campus-2          | partial refund (till app)                               | `ref_c8c9e73384687eb4`                         | completed, 100 cents                           |
| 2026-11-01 12:07  | cashier-campus-2          | full refund of the rest (till app)                      | `ref_4845b3bdc2c7cc3c`                         | completed, 480 cents                           |
| 2026-11-04 16:24  | cashier-campus-1          | order (till app build 3, emulator; BUG-01 evidence)     | `ord_0f2b09ae0ed1a9d0`                         | expired unpaid (ran out of time)               |
| 2026-11-04 16:31  | cashier-campus-1          | order (till app build 3, emulator; BUG-01 evidence)     | `ord_f775175e48e4a4cb`                         | expired unpaid (build 3 run)                   |
| 2026-11-04 16:39  | cashier-campus-1          | order (till app build 3, emulator; BUG-01 evidence)     | `ord_29811730c70dad62`                         | expired unpaid (ran out of time)               |
| 2026-11-04 16:46  | cashier-campus-1          | order (till app build 3, emulator; BUG-01 evidence)     | `ord_4426620cc8075837`                         | expired unpaid (build 4 run)                   |

The two 2026-10-31 probe orders: one was intended. The second came from a bug: the first run saved
its intent with a fractional `firstSentAt` (from `performance.now()`), the second run could not read
that record back and, at the time, treated the store as empty, so it created a new order with a new
key. Fixes: the server clock returns whole milliseconds, the controller refuses every new action while
any saved record of the user is unreadable, and the test harness uses a fractional monotonic clock
so the tests catch it (see [progress.md](progress.md)).

## Stage 3 observations (2026-10-31 and 2026-11-01)

- **Payment settlement grows the version** (the open question from stage 2). Probe payment:
  `pending v1` (write response) → `pending v1` (read) → `confirmed v2`; its order (cashier view)
  `open v1` → `paying v2` → `paid v3`. App payment: `confirmed v2`, history `payment_created` →
  `payment_confirmed`. No equal-version rule is needed for payments; none was added.
- **Refunds grow the parent payment's version**: v2 (confirmed) → v3 refund requested → v4 refund
  completed → v5 → v6 for the second refund. The payment stays `confirmed`; `refundableAmountCents`
  went 580 → 480 → 0 and `refundedAmountCents` 0 → 100 → 580. Both refunds completed within seconds.
- **One order, three prices**: `ord_5dda3faa7e8d5ab4` read by the three seeded payers while open:
  student 340, staff 580, guest 750 cents; the till's cashier view (`amounts`) listed the same.
- **Expired orders stay readable by payers** (200, status `expired`, version unchanged).
- **An expired token is not always `session_expired`**: a token read 5.2 minutes after sign-in got
  `401 session_expired`; at 6 minutes the same token got `401 unauthorized`. The contract and the
  brief only promise `session_expired`. Found because the till's payment list failed after the
  cashier had been idle for about 7 minutes; the session coordinator now logs in again on either code
  (a 401 means the server did nothing, so the repeat is safe).

## Stage 4 observations: finance reads (2026-11-01, read-only)

- **Reports add up.** For every day checked, `netCents = grossCents − refundedCents` overall, per
  mensa and per till; the overall totals equal the sum of the mensas, and each mensa the sum of its
  tills.
- **A cross-day refund makes a negative net**: 25 October 2026 (Sunday) has no payments, €2.70 of
  refunds completed and a net of −€2.70.
- **Report and list agree on Berlin days**: 23 October 2026 reports 223 confirmed payments and
  €811.60; the confirmed payments listed between `2026-10-23T00:00:00+02:00` and
  `2026-10-24T00:00:00+02:00` are the same 223 and €811.60.
- **`from`/`to` need an offset**: `2026-10-25T00:00:00+02:00` and `…Z` work; a date only or a time
  without offset answers `400 invalid_request`. Encoded `+` arrives intact.
- **`q`** matches the start of a payment, order or payer ID, case-insensitively (`pay_76` and
  `PAY_76` both give 23); names do not match (`Test` gives 0).
- **Filters combine with AND**: a mensa with another mensa's till gives an empty page; an unknown till
  gives an empty page (`200`), not an error.
- **Paging**: `limit` above 200 and an unknown `cursor` answer `400 invalid_request`. All seeded and
  live payments: 5,582 in 28 pages of 200 (cursors are opaque, 52 characters), newest first, no
  duplicates across pages.
- **Needs attention**: 9 payments, reasons `pending_too_long` (4), `refund_pending_too_long` (2),
  `refund_failed` (3); statuses pending and confirmed only. One flagged payment
  (`pay_a187fa060754b166`, `refund_failed`) shows `refundableAmountCents: 0` with nothing refunded:
  the dashboard shows the server's numbers as they are.
- **CORS from a browser** (headless Chrome, at `http://localhost:4173` and on 2026-11-02 at the
  deployed origin `https://zahln-mensa-dashboard-4ft.pages.dev`): every preflight allowed
  `X-Candidate-Id`, the authenticated ones `Authorization` too, with `Access-Control-Allow-Origin: *`;
  no request was blocked.

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
`Date` (`data-server-date-readable="true"`). The deployed origin
(`https://zahln-mensa-dashboard-4ft.pages.dev`) passed the same browser checks on 2026-11-02. Every web request carries `X-Candidate-Id`, so every request is preflighted; the 600 s
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
   logs the same account in again on `401 session_expired`, and on `401 unauthorized`, which the live
   API answers once a token has been expired for a while (observation 11). **That is a mock-specific
   mechanism**; a production app would need refresh tokens or a device-bound credential.
7. **Order expiry does not grow `version`** (seen on both probe orders: `open` v1 → `expired` v1). The
   contract says `Order.version` "grows with every change". The client accepts exactly this change at
   an equal version (`isLaterOrderState` in `packages/domain/src/versioning.ts`) and nothing else, so a
   stale `open` read still cannot replace `expired`. Payment settlement and refunds do grow the version
   (stage 3 observations above).
8. **`q` on `GET /payments` is a prefix search** ("Payment ID, order ID or payer ID, or the start of
   one"). Any screen that searches must check hits for an exact match.
9. **No resource carries its idempotency key, and nothing can be looked up by key.** So a read cannot
   tell which attempt created a payment, order or refund: after a declined attempt, a new attempt
   for the same order, payer and amount looks identical (a declined payment frees the order for
   another try), and stale reads or an incomplete search can show the old one. The client therefore
   settles a lost response only with the intent's own same-key resend inside the 24-hour retention
   (stage 3 removed the read-based matching of stage 2; see the regression in `progress.md`). A
   lost `POST /orders` or `POST …/refunds` has no read path at all. Refunds are also never matched
   by amount, reason or time, because two refunds can share all three.
10. **One read does settle a lost payment**: an order read as `paid` without the payer's own
    `paymentId`. The contract says a payer sees their own payment on the order, only one payment can
    be pending, `paid` is final ("paid", no way back) and "only `confirmed` means the payer has paid".
    So the payer's attempt did not pay the order. The app says exactly that ("paid by another payer;
    your attempt did not pay it"), and nothing more.

11. **Expired sessions answer `401 unauthorized`** after about a minute, not `session_expired` (see
    the stage 3 observations). A client that follows the documented code alone stops working after a
    short idle period.

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
- Return the idempotency key on payments, orders and refunds, or let a client look up a write by
  its key (and list a till's recent orders), so a lost response can be attributed by reading, also
  after the retention window.
- Offer an exact `orderId` filter on `GET /payments` next to the prefix search.
- Give reports a version or ETag and a generated-at timestamp; offer a server-side CSV export or a
  snapshot cursor, so a multi-page export is consistent; return a total count with lists.
- Let finance acknowledge or assign a payment that needs attention.
- Specify the `qrPayload` format and add a signature or checksum, so a scanner can reject foreign codes.
- Answer every request with an ended session with `401 session_expired`, as documented.
- Add refresh tokens and a request ID header; make step-up payment authorization server-verifiable.
