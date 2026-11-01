# Manual tests (devices and the deployed dashboard)

For the physical devices: a Google Pixel XL (Android 10) for the student app, and an iPad for the till
(an Android emulator or a second phone can be the other surface). Nothing here is recorded as passed
until you run it; results go into `docs/progress.md`.

Ground rules for every case:

- Never clear app data or uninstall to "restart": that deletes the saved payment records the tests are
  about. A restart is a force stop (or swipe away) and a relaunch.
- A timeout, a lost connection or a stopped check must never show "declined" or "paid". Only the
  server's `confirmed` shows as paid.
- Note the time (Berlin) of each payment so it can be found in the history and on the till.

## Setup

1. **Pixel (student)**: enable USB debugging, connect, check `adb devices -l` lists it, then
   `adb -s <serial> install -r artifacts/android/<student APK from the handoff>`. It installs over the
   earlier build (same app ID and signing key), keeping its saved data.
2. **Screen lock**: set a PIN and enrol a fingerprint (Settings → Security). Needed for paying.
3. **Till on the iPad**: install Expo Go from the App Store (it supports SDK 54 projects). On the Mac:
   `pnpm till`, then scan the QR code shown in the terminal with the iPad camera. Mac and iPad must be
   on the same network; if Expo Go asks, sign in with the same Expo account as the CLI. Expo Go runs
   the till's JavaScript with Expo Go's own native modules, so this tests the till's behaviour, not a
   till build.
4. **Till on Android (alternative)**: `adb install -r` the till APK on the emulator or a second phone.

## Student: scan and pay (Pixel)

| #   | Steps                                                                                 | Pass when                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Start the app. Choose "staff".                                                        | Home shows "Hello Test Staff", "Staff price", "Payments are available".                                                                     |
| S2  | On the till, ring up 1 item. On the phone: "Pay at the till" → "Allow camera" → deny. | Explanation stays; "Allow camera" is offered again.                                                                                         |
| S3  | "Allow camera" → deny again (Android may skip the dialog the second time).            | "Camera access is off for this app" with "Open settings". Settings → Permissions → Camera → allow; back in the app the camera shows.        |
| S4  | Point the camera at the till's QR code.                                               | One review screen opens (not several), with mensa, till, items, "Staff" and the amount the till lists for Staff.                            |
| S5  | Back to scanning; point at a QR code that is not from the till (any website QR).      | "This is not a till payment code." Nothing is opened in a browser. "Scan again" works.                                                      |
| S6  | Type a wrong code (`ord_wrong`) under "Type the code instead".                        | "Order not found."                                                                                                                          |
| S7  | Open a till order and wait 5 minutes without paying.                                  | "This order has expired" and no pay button; the countdown follows server time (change the phone's clock: nothing changes).                  |
| S8  | New order. "Pay" → fingerprint prompt → cancel.                                       | "Not paid: the confirmation was cancelled." The till still shows "Waiting for payment".                                                     |
| S9  | "Pay" → in the prompt choose "Use PIN" (if offered) → enter PIN.                      | Payment proceeds. Record whether Android 10 offered the PIN option.                                                                         |
| S10 | New order. "Pay" → fingerprint. Tap "Pay" twice quickly before that.                  | One prompt, one payment: the till's list shows a single payment.                                                                            |
| S11 | After paying.                                                                         | "Payment is being checked" then "Paid" on the phone; the till shows "Paid" with the same amount and price group. The history lists it once. |
| S12 | Settings → Display → largest font, then repeat S4–S11.                                | Amount and the pay button stay visible (the bottom bar grows); nothing is cut off.                                                          |
| S13 | Switch the language (Home → Deutsch) and repeat a payment.                            | All texts German, amounts as "5,80 €", dates as dd.mm.yyyy.                                                                                 |

## Student: network and lifecycle (Pixel)

Four different situations; airplane mode before "Pay" produces only the first. Write down which one
each run actually produced.

- **Offline before sending**: the app knows nothing left the phone, or cannot tell. It is not a lost
  response, and the payment gate or the server-time check may stop the payment before any request.
- **Outcome unknown**: a request may have reached the server; only a resend with the same key, or a
  read that settles it, can tell.
- **Pending**: the server has the payment and is still checking it.
- **Lost response** (the server applied the payment, the answer never arrived): it cannot be forced
  by hand. The deterministic proof is the simulated-server tests (`lose_response` with
  `applied: true`); on a device it can only happen by chance or with N3's timing.

| #   | Steps                                                                                                                                                                                                                  | Pass when                                                                                                                                                                                                                                                                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | Offline before sending: review screen open, airplane mode on, "Pay" → fingerprint.                                                                                                                                     | One of: "Pay" is unavailable with "Payment availability could not be checked…", "The time could not be checked with the server, so nothing was sent", or "Outcome not known yet" (the request was tried; the app cannot tell whether it left the phone). Never "declined", never "paid". |
| N2  | Airplane mode off. Only if N1 ended "Outcome not known yet": "Check again", then "Send again safely".                                                                                                                  | "Check again" stays "not known" unless the order turns out paid by someone else. "Send again safely" asks for the fingerprint, sends the same request again (same key) and shows the server's answer; the till lists at most one payment for the order.                                  |
| N3  | Possible lost response: network on, "Pay" → fingerprint, and switch airplane mode on while "Paying…" shows.                                                                                                            | Timing decides. If the request got through, the result is "Outcome not known yet" and N2's resend returns the payment the server already made (the till shows one payment, never two). If it did not, N1's results apply. Record which happened.                                         |
| N4  | Pending: watch a payment while the server is still checking it (the mock sometimes takes minutes), or open a seeded pending payment in the history.                                                                    | "Payment is being checked" / "Being checked", never "Paid", until the server says confirmed.                                                                                                                                                                                             |
| N5  | Pay, then put the app in the background for 1 minute, then return.                                                                                                                                                     | The result is current (polling paused and resumed); no second payment.                                                                                                                                                                                                                   |
| N6  | Process kill with a saved unresolved payment: only when a payment shows "Outcome not known yet" (from N1 or N3). Force stop (Settings → Apps → Force stop, never "Clear data"), relaunch, sign in as the same account. | Home lists it under recent payments as "Outcome not known yet", read from the device's saved record; "Check again" and "Send again safely" work as in N2. If no payment was left unresolved, record N6 as not run: do not clear data or get around the payment gate to create one.       |
| N7  | Stay signed in for more than 5 minutes, then open the history.                                                                                                                                                         | It loads (the app signs the test account in again by itself).                                                                                                                                                                                                                            |
| N8  | With a payment left "Outcome not known yet", "Switch account" to "guest".                                                                                                                                              | The guest sees none of staff's unfinished payments; switching back shows them again.                                                                                                                                                                                                     |

## Student: history and details (Pixel)

| #   | Steps                               | Pass when                                                                                                          |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| H1  | "Payment history".                  | Newest first; the seeded pending payment shows "Being checked"; "That is all" or "Load older payments" at the end. |
| H2  | Open a refunded payment (after T6). | Refunds with their own status, and the full history: started, confirmed, refund requested, refund completed.       |
| H3  | Airplane mode, pull to refresh.     | "No connection. The list may be incomplete." The loaded rows stay.                                                 |

## Till (iPad or Android)

| #   | Steps                                                                            | Pass when                                                                                                                                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Choose "cashier-campus-1".                                                       | Header shows the mensa and till from the server; the menu shows Student / Staff / Guest prices.                                                                                                                                                                                                                                     |
| T2  | Add items; try more than 20 of one item.                                         | The "+" stops at 20; the basket shows lines and quantities, no single total.                                                                                                                                                                                                                                                        |
| T3  | "Create order and show QR code". Rotate the iPad.                                | A large QR code with a white border, the code underneath, a countdown and the server's total per group; usable in portrait and landscape.                                                                                                                                                                                           |
| T4  | Pay it from the phone.                                                           | "Payment being checked" (not paid), then "Paid" with the amount and price group the payer paid. "Next customer" appears only now.                                                                                                                                                                                                   |
| T5  | Force quit the till app while an order is open, then start it and sign in again. | The open order and its QR come back; no new order can start until it is paid or expired.                                                                                                                                                                                                                                            |
| T6  | "Payments and refunds" → the payment → refund "1,00" → "Check refund" → confirm. | Refund pending, then completed; "Refundable now" drops by 1,00.                                                                                                                                                                                                                                                                     |
| T7  | Type "1,234", "-1", "1.234,50", more than refundable.                            | Clear messages; "Check refund" stays disabled.                                                                                                                                                                                                                                                                                      |
| T8  | "Refund everything left" → confirm.                                              | Completed; "Nothing is left to refund."                                                                                                                                                                                                                                                                                             |
| T9  | Open another cashier's payment (search its ID while signed in at another till).  | Not listed / "This payment belongs to another till."                                                                                                                                                                                                                                                                                |
| T10 | Offline refund: airplane mode on, confirm a refund, airplane mode off.           | "Refund outcome not known" with "Send again safely" (the app cannot tell whether the request left the device; this is the offline path, not a proven lost response). No second refund can start for that payment until it is resolved; "Send again safely" resends the same refund (same key) and shows the server's refund status. |

## Screen readers

| #   | Steps                                                                                                                                                                       | Pass when                                                                                                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | TalkBack on (Pixel): sign in, scan screen, review, pay, result.                                                                                                             | Every control is announced with its role; the scanner says to point at the code; the review reads mensa, items and "Amount to pay"; on the result screen focus lands on the outcome heading, and a later change (being checked → paid) is spoken once, not on every check and not twice. |
| A1b | While a screen is open, let its status change: a pending payment's detail turning confirmed, a scan of a wrong code, a typed wrong code, payments paused on Home or Review. | Each change is spoken once, only on the screen in front; nothing is spoken for a screen underneath.                                                                                                                                                                                      |
| A2  | Pay without looking: use "Type the code instead" with TalkBack.                                                                                                             | The whole payment can be completed.                                                                                                                                                                                                                                                      |
| A3  | VoiceOver on the iPad till (and the iPhone build when available).                                                                                                           | Same; the QR code is announced as an image with its purpose.                                                                                                                                                                                                                             |
| A4  | VoiceOver or TalkBack on the till at tablet width (two columns), from the header downwards.                                                                                 | The whole menu is read before the order panel; "Create order and show QR code" is not reached between dishes.                                                                                                                                                                            |

## Dashboard (desktop browser; then the deployed URL)

`pnpm dashboard:browser-check` covers the data checks automatically; these need a person.

| #   | Steps                                                                                                                                                                                  | Pass when                                                                                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Keyboard only: Tab from the address bar through sign-in, navigation, the day picker, the filters, the table region (arrow keys scroll it), "Load more", the export and a payment link. | Every control is reachable in a sensible order with a visible focus ring; Enter and Space work; nothing needs a mouse.                                      |
| D2  | VoiceOver (macOS, Safari) on Daily totals and a payment.                                                                                                                               | Page heading announced on navigation; table cells read with their column and row headers ("Kasse 1, Mensa am Campus"); status lines and failures announced. |
| D3  | Deployed URL in a private window: sign in, 25 October 2026, a filtered list, a payment, a CSV download, Deutsch.                                                                       | HTTPS, no sign-in carried over, the same numbers as locally, the file opens with umlauts intact. Then `pnpm dashboard:browser-check -- --url <URL>`.        |
| D4  | Open a deep link (`…/#/payments/<id>`) in a new private window.                                                                                                                        | Sign-in first, then that payment.                                                                                                                           |

## iPhone 17 Pro (Face ID)

Face ID needs a development build; Expo Go cannot show the app's Face ID permission. Steps are in
`docs/progress.md`, "Manual steps". Then repeat S8–S11 with Face ID and with "Enter Passcode".
