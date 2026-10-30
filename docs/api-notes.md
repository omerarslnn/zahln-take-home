# API notes

Observations against `https://dev.zahln.de` (candidate namespace from the API email). All
observations below are from 2026-10-29 and are redacted: no tokens, passwords, user IDs or
transaction data.

## Contract copy and live spec

- `packages/api/openapi/openapi.json` is a byte-identical copy of the supplied file
  (SHA-256 `65c44984…e999`). The original stays untouched in the local `brief/` folder.
- `pnpm api:spec-diff` compares the live `https://dev.zahln.de/openapi.json` with the copy after
  parsing. **Result: semantically identical.** The live file is minified and the supplied one is
  pretty-printed; that is the only difference.

## Smoke check results (`pnpm api:smoke`)

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

## CORS

Simulated from Node (`pnpm api:smoke`), origins `http://localhost:5173` and `http://localhost:4173`:

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
   ("a version below `minAppVersion` is refused with 426"). The native apps send it from `app.json`.
   **`minAppVersion` is `1.0.0` and the apps are `0.1.0`**, so payments would be refused until the
   version is raised.
3. **Response headers are undocumented**: neither `Idempotent-Replayed` nor `Date` appears in the
   response definitions, although the description relies on both (and CORS exposes both).
4. **503 on `POST /orders/{id}/payments` lists only `payments_disabled`**, while the overview says any
   request can fail with `503 unavailable` before anything happens. The client must branch on
   `code`, never on the status alone.
5. **Problem bodies** have `code`, `title`, `status`, `retryable` and optional `detail`. There is no
   `type`/`instance` (optional in RFC 9457) and no request ID header for support correlation.
6. **Sessions**: tokens last 5 minutes, there is no refresh token and no logout endpoint, so re-login
   needs the credentials again. For the seeded mock users the apps can log in again from the chosen
   seeded account; a production app would need refresh or device-bound credentials.

## Notes the payment design depends on

- **QR format.** `qrPayload` "names the order, not an amount". Its format (raw order ID, URL or opaque
  token) is not specified and has not been observed, because that needs a cashier `POST /orders`, which
  this stage does not send. Stage 2 must record a real payload before writing a parser. The scanner
  should reject anything that does not match the observed format instead of guessing.
- **PIN / biometric proof.** No endpoint verifies a PIN or biometric result; `POST …/payments` needs
  only the bearer token. Local biometric/PIN confirmation is therefore a device-side gate, not proof the
  server can check. Production would need server-verifiable step-up authentication (for example a
  device-bound key signing a challenge, as strong customer authentication requires).
- **Idempotency retention.** Keys are kept 24 hours per user. A locally persisted intent older than
  that must not be resent with the same key (the server may treat it as new). It has to be
  reconciled by reading (e.g. `GET /payments?q=<orderId>`). Orders expire after 5 minutes, but a
  payment can stay `pending` for minutes, so recovery must work from reads as well as replays.
- **Unversioned reports.** `DailyTotals` has no `version`, ETag or "generated at", so a stale report
  cannot be detected and totals may appear to move backwards between reads. Show the server `Date` as
  "as of", and do not present a day as final. Payments count on the day they were made and refunds on
  the day they completed, both in Europe/Berlin.
- **CSV limitations.** There is no export endpoint. The dashboard must page through `GET /payments`
  (`limit` ≤ 200, `cursor`) for the selected filter and include every page, de-duplicating by payment
  ID (keeping the highest `version`) in case pages shift while new payments arrive. `from`/`to` need
  ISO timestamps with offset, computed for Europe/Berlin days, which are 23 or 25 hours long on DST
  change days. List items have no refund list or history; a full-history export would need one
  `GET /payments/{id}` per row.

## What we would change in the API (draft for the design document)

- Declare `X-Candidate-Id` (required), `X-App-Version`, `Idempotent-Replayed` and `Date` in the spec.
- Give reports a version or ETag and a generated-at timestamp; offer a server-side CSV export.
- Specify the `qrPayload` format and add a signature or checksum, so a scanner can reject foreign codes.
- Add refresh tokens and a request ID header; make step-up payment authorization server-verifiable.
