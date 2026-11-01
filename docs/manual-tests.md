# Manual device tests (stage 3)

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

| #   | Steps                                                                                                               | Pass when                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | Review screen open. Airplane mode on. "Pay" → fingerprint.                                                          | Either "Not sent" (nothing reached the server) or "Outcome not known yet". Never "declined", never "paid".                                                                                      |
| N2  | Airplane mode off. On the result: "Check again".                                                                    | It stays "Outcome not known yet" unless the order shows paid by someone else. "Send again safely" asks for the fingerprint, then shows the server's answer; the till shows one payment at most. |
| N3  | Pay, then immediately put the app in the background for 1 minute, then return.                                      | The result is current (polling paused and resumed); no second payment.                                                                                                                          |
| N4  | Pay with airplane mode on (lost answer), then force stop the app (Settings → Apps → Force stop) and start it again. | After sign-in, Home lists the payment under "recent payments" as "Outcome not known yet". This is the real OS process-kill test.                                                                |
| N5  | Stay signed in for more than 5 minutes, then open the history.                                                      | It loads (the app signs the test account in again by itself).                                                                                                                                   |
| N6  | During N1/N4, "Switch account" to "guest".                                                                          | The guest sees none of staff's unfinished payments; switching back shows them again.                                                                                                            |

## Student: history and details (Pixel)

| #   | Steps                               | Pass when                                                                                                          |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| H1  | "Payment history".                  | Newest first; the seeded pending payment shows "Being checked"; "That is all" or "Load older payments" at the end. |
| H2  | Open a refunded payment (after T6). | Refunds with their own status, and the full history: started, confirmed, refund requested, refund completed.       |
| H3  | Airplane mode, pull to refresh.     | "No connection. The list may be incomplete." The loaded rows stay.                                                 |

## Till (iPad or Android)

| #   | Steps                                                                            | Pass when                                                                                                                                 |
| --- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Choose "cashier-campus-1".                                                       | Header shows the mensa and till from the server; the menu shows Student / Staff / Guest prices.                                           |
| T2  | Add items; try more than 20 of one item.                                         | The "+" stops at 20; the basket shows lines and quantities, no single total.                                                              |
| T3  | "Create order and show QR code". Rotate the iPad.                                | A large QR code with a white border, the code underneath, a countdown and the server's total per group; usable in portrait and landscape. |
| T4  | Pay it from the phone.                                                           | "Payment being checked" (not paid), then "Paid" with the amount and price group the payer paid. "Next customer" appears only now.         |
| T5  | Force quit the till app while an order is open, then start it and sign in again. | The open order and its QR come back; no new order can start until it is paid or expired.                                                  |
| T6  | "Payments and refunds" → the payment → refund "1,00" → "Check refund" → confirm. | Refund pending, then completed; "Refundable now" drops by 1,00.                                                                           |
| T7  | Type "1,234", "-1", "1.234,50", more than refundable.                            | Clear messages; "Check refund" stays disabled.                                                                                            |
| T8  | "Refund everything left" → confirm.                                              | Completed; "Nothing is left to refund."                                                                                                   |
| T9  | Open another cashier's payment (search its ID while signed in at another till).  | Not listed / "This payment belongs to another till."                                                                                      |
| T10 | Airplane mode, confirm a refund, airplane mode off.                              | "Refund outcome not known" with "Send again safely"; no second refund can start for that payment until it is resolved.                    |

## Screen readers

| #   | Steps                                                                                       | Pass when                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | TalkBack on (Pixel): sign in, scan screen, review, pay, result.                             | Every control is announced with its role; the scanner says to point at the code; the review reads mensa, items and "Amount to pay"; the result is announced once when it changes, not on every check. |
| A2  | Pay without looking: use "Type the code instead" with TalkBack.                             | The whole payment can be completed.                                                                                                                                                                   |
| A3  | VoiceOver on the iPad till (and the iPhone build when available).                           | Same; the QR code is announced as an image with its purpose.                                                                                                                                          |
| A4  | VoiceOver or TalkBack on the till at tablet width (two columns), from the header downwards. | The whole menu is read before the order panel; "Create order and show QR code" is not reached between dishes.                                                                                         |

## iPhone 17 Pro (Face ID)

Face ID needs a development build; Expo Go cannot show the app's Face ID permission. Steps are in
`docs/progress.md`, "Manual steps". Then repeat S8–S11 with Face ID and with "Enter Passcode".
