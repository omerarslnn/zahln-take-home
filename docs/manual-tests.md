# Manual tests (devices and the deployed dashboard)

For the physical devices: a Google Pixel XL (Android 10) and an iPhone (Face ID) for the student app,
and an iPad for the till (an Android emulator or a second phone can be the other surface). Nothing here
is recorded as passed until you run it; results go into `docs/progress.md` (first device round:
2026-11-04, "Physical-device results").

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
3. **Till on the iPad (development build)**: once,
   `pnpm --filter @mensa/till exec expo run:ios --device --port 8082` builds and installs Mensa Till
   with `expo-dev-client`. Afterwards start `pnpm till` (Metro 8082) and open the app; it connects
   through the `mensa-till://` scheme. Mac and iPad on the same network.
4. **Till in Expo Go (alternative)**: start `pnpm till` and press `s`, then scan the QR code with the
   iPad camera (the App Store's Expo Go supports SDK 54). This runs the till's JavaScript with Expo
   Go's own native modules, so it tests the till's behaviour, not a till build.
5. **Student on the iPhone (Face ID)**: `pnpm --filter @mensa/student exec expo run:ios --device`
   builds and installs a debug build; afterwards `pnpm student` (Metro 8081). Both Metro servers run
   side by side.
6. **Till on Android (alternative)**: `adb install -r` the till APK on the emulator or a second phone.

## Final physical-device matrix (Phase 6)

Run in this order; stop at the first failure and note it in `docs/progress.md`. **[W]** marks a
step that writes to the live mock (an order, a payment or a refund); every other step only reads.
Builds: student 7 and till 6 (`v1.0.0-final` release, or `artifacts/android/`), and the current
source on the iPhone and the iPad.

**Preparation**

```sh
# Pixel XL: install over build 6 (keeps its data)
adb -s <serial> install -r artifacts/android/mensa-student-1.0.0-7-armeabi-v7a+arm64-v8a-4fe08aa.apk
# iPhone 17 Pro: a native rebuild is required (build 7, and the English/German declarations iOS reads)
pnpm --filter @mensa/student exec expo run:ios --device          # then: pnpm student (Metro 8081)
# iPad A16: a native rebuild is recommended for the same reasons (build 6); the minimum is a Metro
# restart with a cleared cache, which brings all JavaScript changes:
pnpm --filter @mensa/till exec expo run:ios --device --port 8082 # then: pnpm till (Metro 8082)
pnpm --filter @mensa/till exec expo start --port 8082 --clear    # minimum, without a rebuild
```

| #   | Device       | Steps                                                                                                                                  | Pass when                                                                                                                  |
| --- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| F1  | Pixel        | After the install: open, sign in as Student.                                                                                           | History still lists the earlier payments (data kept); Diagnostics: "App version 1.0.0", "HTTP 200 in N ms" (whole number). |
| F2  | Pixel        | Force stop; open; type `student` / `test1234`; sign in.                                                                                | Home. The keyboard never covers the focused field.                                                                         |
| F3  | Pixel + iPad | **[W]** iPad: an order. Pixel: scan, review, "Pay", fingerprint.                                                                       | Both: being checked → Paid, same amount and price group.                                                                   |
| F4  | Pixel        | New order; "Pay"; cancel the prompt.                                                                                                   | "Not paid: the confirmation was cancelled."; the iPad still waits.                                                         |
| F5  | Pixel        | Review open; airplane mode on, then off (N9).                                                                                          | One notice, no "Pay"; "Pay" returns by itself.                                                                             |
| F6  | Pixel        | Settings → System → Languages: Deutsch first; open the app; then back to English.                                                      | German everywhere, without a restart; then English.                                                                        |
| F7  | Pixel        | Font size and display size largest; Home, review, history, detail.                                                                     | Everything wraps; the pay bar stays visible; nothing clipped.                                                              |
| F8  | Pixel        | TalkBack procedure **SR1** below.                                                                                                      | All of SR1 passes.                                                                                                         |
| F9  | iPhone       | **[W]** After the rebuild: an order on the iPad; scan; "Pay"; Face ID.                                                                 | Paid on both; the Face ID prompt names Mensa Pay's reason.                                                                 |
| F10 | iPhone       | New order; "Pay"; cancel Face ID.                                                                                                      | "Not paid"; nothing on the iPad.                                                                                           |
| F11 | iPhone       | **[W]** "Pay"; let Face ID fail (look away) until "Enter Passcode"; enter the passcode.                                                | The passcode is accepted and the payment completes once.                                                                   |
| F12 | iPhone       | Settings → Mensa Pay → Language → Deutsch (appears after the rebuild); open the app.                                                   | The app is in German; the rest of the phone keeps its language.                                                            |
| F13 | iPhone       | VoiceOver procedure **SR2** below.                                                                                                     | All of SR2 passes.                                                                                                         |
| F14 | iPad         | Auto-Lock 2 minutes; **[W]** an order; wait 3 minutes; then Home button and back.                                                      | The screen stays on while the code is shown; in the background it locks; back: the same order.                             |
| F15 | iPad         | **[W]** Pay it (F3 or F9), then refund €1.00, then "Refund everything left".                                                           | Both refunds complete; "Nothing is left to refund."; the phone's detail lists both.                                        |
| F16 | iPad         | German (Settings → Mensa Till → Language, after a rebuild, or Diagnostics → Deutsch) and Larger Text largest; checkout, order, refund. | German; everything wraps; the code stays whole.                                                                            |
| F17 | iPad         | VoiceOver procedure **SR3** below.                                                                                                     | All of SR3 passes.                                                                                                         |
| F18 | Pixel + iPad | **[W]** Unresolved, safely: during "Payment is being checked" on the Pixel, airplane mode on for 30 s, then off.                       | It never shows "paid" or "declined" while offline; afterwards it settles to Paid; one payment on both devices.             |
| F19 | Pixel        | **[W]** Pay; while "being checked", force stop the app; reopen; sign in.                                                               | Home lists the payment first as unfinished, then it settles; one payment only.                                             |
| F20 | Desktop      | Dashboard D1 (keyboard only) and D2–D4 on https://zahln-mensa-dashboard-4ft.pages.dev/; open an exported CSV in a spreadsheet.         | Keyboard reaches everything with a visible focus ring; cells starting with `=`, `+`, `-` or `@` show as text.              |

F18 and F19 are the safest device versions of an unresolved payment: a genuinely lost response
cannot be produced on demand; that case is covered by the simulated-server tests
(`intent-controller.test.ts`).

### SR1: TalkBack on the Pixel XL (student build 7)

1. Settings → Accessibility → TalkBack → on. Swipe right/left moves, double-tap activates,
   two-finger swipe scrolls.
2. Sign-in: each field is read with its label ("Username, edit box"), "Show password" as a button;
   double-tap the demo row "Student, Enrolled at the university. Pays student prices."
3. Home: "Scan to pay, button", then "Payment history".
4. Scan: the camera explanation and "Allow camera"; then "Type the code instead": "Order code, edit
   box"; type the code shown under the till's QR code; "Open order".
5. Review: the mensa and till, each item as one phrase ("2 times Pasta with tomato sauce, €2.20
   each"), "Amount to pay: €4.40", then "Pay €4.40, button" with the hint "Asks for your
   fingerprint, face or device PIN first". Moving focus onto "Pay" does nothing by itself.
6. **[W]** Double-tap "Pay"; the fingerprint prompt is read; touch the sensor.
7. Result: focus moves to the heading; "Payment is being checked" and then "Paid" are each spoken
   once, not repeated while it checks.
8. History: each row is one phrase with its status ("Mensa am Campus, Confirmed, €4.40, 12:03 ·
   Kasse 1"); the detail reads the amount, the refunds and the timeline.
9. A second order: "Pay", then cancel the prompt: "Not paid: the confirmation was cancelled." is
   spoken.
10. Pass when every step works without looking, no element is unreachable or read twice, and nothing
    happens on focus alone.

### SR2: VoiceOver on the iPhone 17 Pro (student, development build)

1. Settings → Accessibility → VoiceOver → on (or triple-click the side button after setting the
   shortcut). Swipe to move, double-tap to activate, three-finger swipe to scroll.
2. Repeat SR1 steps 2–5: the same labels and order; the amount and "Pay €…" are reachable.
3. **[W]** Double-tap "Pay": Face ID is announced; look at the phone. The result heading gets
   focus; "being checked" and "Paid" are each spoken once.
4. Cancel case: "Pay", then cancel Face ID; the refusal is spoken.
5. Switch to German (F12) and repeat steps 2–3: German labels, amounts as "4,40 €".
6. Pass criteria as in SR1.

### SR3: VoiceOver on the iPad A16 (till)

1. VoiceOver on. Sign in with the demo row "Cashier 1, cashier-campus-1".
2. Checkout, from the top: the header, then the whole menu before the order panel. Each dish is one
   phrase with its three prices, then "Remove one …, button" (dimmed at 0), the count, "Add one …,
   button" (A4).
3. Add two dishes: the count is spoken after each double-tap; the order panel lists them, then
   "Items: 2" and "Create order and show QR code, button".
4. **[W]** Create the order: "QR code for this order. The payer scans it with Mensa Pay.", the order
   code, "Waiting for payment" with the time left when focused (it is not read out every second),
   then the totals per price group as one block after the status, in portrait and in landscape.
5. **[W]** Pay it from a phone: "Payment being checked", then "Paid" spoken once each; "Next
   customer" only then.
6. Payments and refunds: each row one phrase with payer, status, amount and time; open one.
7. Refund: "Refundable now: €…"; "Amount in euros, text field" with its hint; type more than
   allowed: the error is read with the field; a valid amount → "Check refund" → the confirmation
   question with the amount and the payer, "Refund €…" and "Cancel"; Cancel sends nothing.
8. Pass criteria as in SR1.

## Sign-in (Phase 3; student build 5, till build 4)

The published password is the API description's `test1234`. Signing in makes no payment or order.

| #   | Steps                                                                                                                                    | Pass when                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | Student app: tap "Sign in" with both fields empty.                                                                                       | "Enter your username." and "Enter your password." under the fields; no spinner, no request. With TalkBack/VoiceOver: each field reads its label and its error.                |
| L2  | Type `student`, press the keyboard's "next", type a wrong password, press "go".                                                          | "next" moves to the password; "go" signs in. "The username or password is not correct."; the password is emptied, the username kept; Home does not appear.                    |
| L3  | Type the right password; "go".                                                                                                           | Home: "Hello Test Student", "Student price".                                                                                                                                  |
| L4  | "Switch account", then type `cashier-campus-1` and the password.                                                                         | "This account cannot pay with Mensa Pay…"; Home never appears, not even briefly; the password is emptied.                                                                     |
| L5  | Airplane mode on; sign in with `student` and the password.                                                                               | "No connection to the server. Check your internet connection…"; both fields kept. Airplane mode off; "Sign in" works.                                                         |
| L6  | The eye button in the password field (also with TalkBack/VoiceOver).                                                                     | Shows and hides the password; announced as "Show password" / "Hide password", a separate stop after the field.                                                                |
| L7  | Autofill: on the iPhone, tap the username field; on Android, with Google Autofill or a password manager set up.                          | The platform offers saved passwords for the field (record what was offered; nothing is required if no password is saved).                                                     |
| L8  | "Switch account"; tap Student, Staff and Guest under "Try a demo account" in turn (switching account between them). Double-tap one.      | Each signs in with one tap and Home shows the matching price group. While one is signing in, its row shows a spinner and the others are disabled; a double tap signs in once. |
| L9  | Typed sign-in, then stay signed in for more than 5 minutes and open the history.                                                         | It loads (the typed account is signed in again by itself, like N7).                                                                                                           |
| L10 | Till on the iPad, portrait and landscape: the sign-in screen.                                                                            | Two columns: brand and form left, demo cashiers right, grouped by Mensa am Campus, Mensa Nord, Cafeteria Bibliothek. Nothing clipped.                                         |
| L11 | Till: type `student` and the password.                                                                                                   | "This is not a cashier account…"; the checkout never appears.                                                                                                                 |
| L12 | Till: tap "Cashier 1 · cashier-campus-1"; with a hardware keyboard (if available) also type the credentials, Tab between fields, Return. | Checkout appears with the server's mensa and till. Return in the password field signs in.                                                                                     |
| L13 | Largest font (Settings → Display / Accessibility), both sign-in screens.                                                                 | Everything wraps and scrolls; no clipped field, button or row; the status bar area never covers text while scrolling.                                                         |

## Language (Phase 3; student build 5, till build 4)

The app follows the device: German when the device (or the app's own language setting) prefers
German, otherwise English. Normal screens have no language switch; Diagnostics has a test override.

| #   | Steps                                                                                                                                                                                           | Pass when                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | Device language German; start the app.                                                                                                                                                          | Every screen German (sign-in, home, review, results, history); amounts "5,80 €"; no language switch on Home (student) or Checkout (till).          |
| G2  | Device language English, then an unsupported one (for example Türkçe) above English.                                                                                                            | English both times.                                                                                                                                |
| G3  | Pixel (Android 10): app open and signed in, ideally on a review screen. Settings → System → Languages: move Deutsch to the top (or back). Return to the app.                                    | The texts switch language; still signed in, the screen and any unfinished payment unchanged (no return to sign-in). Record what happened.          |
| G4  | Android 13 or newer only: Settings → Apps → Mensa Pay → Language → Deutsch. The Pixel XL (Android 10) has no per-app languages: record "not applicable".                                        | Only the app switches, live, as in G3.                                                                                                             |
| G5  | iPhone / iPad with the new build: Settings → Mensa Pay (or Mensa Till) → Language → Deutsch, then reopen the app.                                                                               | iOS restarts the app; it opens in German. (This option appears only with a build that declares both languages.)                                    |
| G6  | Diagnostics → Language → English while the device is German; go back to Home / Checkout with an unfinished payment or an open order. Then "Device language (Deutsch)". Force stop and relaunch. | English at once, nothing reloaded or lost; "Device language (Deutsch)" returns to German; after the relaunch the app follows the device again.     |
| G7  | TalkBack/VoiceOver on Diagnostics → Language.                                                                                                                                                   | Three radio options in one group; the selected one is announced as checked/selected; "Deutsch" and "English" are each named in their own language. |

## Student redesign regression (Phase 4, student build 6, Pixel)

Install build 6 over build 5 (keeps the saved payments and the history). One real payment is enough
for P3–P5; the other rows need none.

| #   | Steps                                                                                          | Pass when                                                                                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Sign in with "Student".                                                                        | Home: "Hello Test Student", "Student price", the blue "Scan to pay" tile, "Payment history". No availability banner while payments are available.                                                       |
| P2  | "Scan to pay"; point at the till's QR code.                                                    | A framed viewfinder with corner guides and one instruction line; exactly one review opens.                                                                                                              |
| P3  | The review.                                                                                    | Mensa and till at the top; the amount to pay large, equal to the till's amount for Student; "Student price" and a countdown that follows server time; "Pay €…" at the bottom with the fingerprint note. |
| P4  | "Pay" → fingerprint.                                                                           | Result: "Payment is being checked" (clock icon), then "Paid" with the tick scaling in once; "Done" goes home and the result leaves Home.                                                                |
| P5  | New order; "Pay" → cancel the prompt.                                                          | "Not paid: the confirmation was cancelled." on the review; the till still waits.                                                                                                                        |
| P6  | Review open, airplane mode on.                                                                 | Exactly one availability warning, no "Pay" (as N9); airplane mode off: "Pay" returns by itself.                                                                                                         |
| P7  | "Payment history".                                                                             | "Today" first, payments grouped per day in one card, each row with mensa, status in words, amount, time and till. Pull to refresh works; "Load older payments" pages.                                   |
| P8  | Airplane mode on, pull to refresh.                                                             | "No connection. The list may be incomplete." above the rows, which stay.                                                                                                                                |
| P9  | Open the new payment, then a refunded one (after T6).                                          | Status and amount at the top, date, payment reference, items with unit prices, a timeline of the server's events; the refunded one lists its refunds and "Can still be refunded".                       |
| P10 | Diagnostics → Language → Deutsch; repeat P1, P3, P7.                                           | German everywhere: "Scannen und bezahlen", "7,80 €", "Heute", "Gestern".                                                                                                                                |
| P11 | Settings → Display → Font size largest; force stop and reopen; Home, review, result, history.  | Everything wraps; the pay bar stays visible; no clipped amounts, buttons or rows.                                                                                                                       |
| P12 | Settings → Accessibility → Remove animations; pay once more (or open a paid result from Home). | The paid result appears without the scale-in.                                                                                                                                                           |
| P13 | TalkBack on the history and a result.                                                          | A history row is read as one phrase with its status ("Mensa am Campus, Confirmed, €7.20, 17:03 · Kasse 1"); the result's heading is focused and read once.                                              |

## Till redesign regression (Phase 5, till build 5, iPad)

On the iPad's development build no reinstall is needed: stop `pnpm till`, start it again with a
cleared cache (`pnpm --filter @mensa/till exec expo start --port 8082 --clear`) and reopen Mensa Till
(see [progress.md](progress.md), Phase 5). On Android, `adb install -r` the build 5 APK over build 4.
K4 and K8 make one real order each; K12 one refund.

| #   | Steps                                                                                                                                  | Pass when                                                                                                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K1  | Sign in with "Cashier 1 · cashier-campus-1".                                                                                           | Checkout without a navigation bar: the till mark, "Mensa am Campus · Kasse 1", "Signed in as …", then "Payments and refunds", "Switch cashier" and the Diagnostics icon. The menu on the left, "Order" on the right; each dish shows Student, Staff and Guest prices.                   |
| K2  | Tap "+" on two dishes, "−" once; go past 20 of one dish.                                                                               | Large − and + with the count between them; a dish in the order is tinted; the order lists lines with quantities and "Items: N", no total; "+" stops at 20; "Clear order" empties it.                                                                                                    |
| K3  | Rotate the iPad with items in the order.                                                                                               | The order and quantities stay; menu and order each scroll on their own.                                                                                                                                                                                                                 |
| K4  | Set Settings → Display & Brightness → Auto-Lock to 2 minutes. "Create order and show QR code"; leave the iPad untouched for 3 minutes. | A large QR code with "Order code (to type instead of scanning)" and the `ord_…` code under it; "Waiting for payment" with an m:ss countdown; the server's total per group. Nothing covers the code. The screen stays on.                                                                |
| K5  | Rotate while the code is shown.                                                                                                        | Portrait: the code full width, status and totals side by side below. Landscape: the code left, status and totals right. The countdown keeps counting.                                                                                                                                   |
| K6  | Press Home while the code is shown, wait 3 minutes, reopen.                                                                            | The screen locks as usual while the app is in the background; reopened, the same order and code are back (no new order).                                                                                                                                                                |
| K7  | Let the order run out without paying.                                                                                                  | Under one minute the countdown turns orange; then "Expired, not paid" without a code and "Next customer". After that the iPad locks again after its Auto-Lock time.                                                                                                                     |
| K8  | New order; pay it from the Pixel (E5).                                                                                                 | "Payment being checked", then "Paid" with the payer's amount and "Paid at the Student price"; "Next customer" appears only now. The screen locks normally afterwards.                                                                                                                   |
| K9  | "Payments and refunds".                                                                                                                | A search field, "Times are Berlin time", "Today" first; each row: payer, status in words, time · price group · refunds · payment ID, amount. Pull to refresh; at the end "Load older payments" pages. Searching the start of a payment ID lists only matches, with "Show all payments". |
| K10 | Open the paid payment.                                                                                                                 | Left: status, amount, price group, payer, mensa and till, date, reference, refunds, items, history. Right: "Refund", "Refundable now" from the server, "Refund everything left", the amount and reason fields, "Check refund" (disabled until an amount is valid).                      |
| K11 | Type more than "Refundable now", then "1,00" and a reason; "Check refund"; then "Cancel".                                              | The field says "At most … can be refunded now"; with 1,00 "Check refund" opens "Refund €1.00 to Test Student?" (German: "1,00 € an Test Student erstatten?") with a red "Refund €1.00" and "Cancel". Cancel goes back to the form and sends nothing.                                    |
| K12 | "Check refund" → "Refund €1.00", tapping it twice quickly.                                                                             | One refund only. It is listed with "Refund being processed" (or completed); "Refundable now" drops by 1,00 only when the server says so; while it is pending the form gives way to "A refund for this payment is being processed".                                                      |
| K13 | Diagnostics → Language → Deutsch (or the iPad in German); repeat K1, K4, K9, K11.                                                      | German throughout: "Bestellung", "Wartet auf Zahlung", "Jetzt erstattbar", "9,00 €", "Nächste Person".                                                                                                                                                                                  |
| K14 | Settings → Accessibility → Display & Text Size → Larger Text, largest; repeat K1, K4, K10, K11.                                        | Everything wraps; the code stays square and whole; no clipped amounts, buttons or rows.                                                                                                                                                                                                 |

## End to end: iPad till and Pixel XL student (Phase 5)

One run through both apps after K1–K14 (or instead of K8 and K12). E2–E8 make one order, one
payment and two refunds; E9 one order that expires. Note the Berlin times.

| #   | Steps                                                                                               | Pass when                                                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | iPad: sign in as Cashier 1. Pixel: sign in as Student.                                              | Neither shows an availability warning.                                                                                                                                 |
| E2  | iPad: one vegetarian dish and one coffee → "Create order and show QR code". Note the Student total. | The code, the countdown and the totals per group.                                                                                                                      |
| E3  | Pixel: "Scan to pay" → the iPad's code.                                                             | The review shows Mensa am Campus · Kasse 1, the same items, the iPad's Student total as the amount to pay and a countdown within a few seconds of the iPad's.          |
| E4  | Pixel: "Pay" → cancel the fingerprint prompt.                                                       | The Pixel says it was not paid; the iPad still shows "Waiting for payment".                                                                                            |
| E5  | Pixel: "Pay" → fingerprint.                                                                         | Pixel: "Payment is being checked", then "Paid". iPad: "Payment being checked", then "Paid" with the same amount and "Paid at the Student price", then "Next customer". |
| E6  | iPad: "Next customer" → "Payments and refunds".                                                     | The new payment is first under "Today", payer "Test Student", the same amount.                                                                                         |
| E7  | iPad: refund 1,00 with a reason → confirm. Pixel: open the history and the payment.                 | iPad: the refund completes and "Refundable now" drops by 1,00. Pixel: the row shows "€1.00 refunded"; the detail lists the refund and "Can still be refunded".         |
| E8  | iPad: "Refund everything left" → confirm.                                                           | "Nothing is left to refund." on the iPad; the Pixel's detail lists both refunds.                                                                                       |
| E9  | iPad: a new order; let it expire. Pixel: scan it.                                                   | iPad: "Expired, not paid". Pixel: the order cannot be paid (no "Pay"); nothing is charged.                                                                             |
| E10 | Pixel: open a review, airplane mode on, then off (N9).                                              | One availability warning and no "Pay" while offline; "Pay" returns by itself.                                                                                          |

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
| S13 | Set the phone to German (or Diagnostics → Language → Deutsch) and repeat a payment.   | All texts German, amounts as "5,80 €", dates as dd.mm.yyyy.                                                                                 |

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

| #   | Steps                                                                                                                                                                                                                                                                                                                                                     | Pass when                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | Offline before sending: review screen open, airplane mode on, "Pay" → fingerprint.                                                                                                                                                                                                                                                                        | One of: "Pay" is unavailable with "Payment availability could not be checked…", "The time could not be checked with the server, so nothing was sent", or "Outcome not known yet" (the request was tried; the app cannot tell whether it left the phone). Never "declined", never "paid".                                                                                                                                     |
| N2  | Airplane mode off. Only if N1 ended "Outcome not known yet": "Check again", then "Send again safely".                                                                                                                                                                                                                                                     | "Check again" stays "not known" unless the order turns out paid by someone else. "Send again safely" asks for the fingerprint, sends the same request again (same key) and shows the server's answer; the till lists at most one payment for the order.                                                                                                                                                                      |
| N3  | Possible lost response: network on, "Pay" → fingerprint, and switch airplane mode on while "Paying…" shows.                                                                                                                                                                                                                                               | Timing decides. If the request got through, the result is "Outcome not known yet" and N2's resend returns the payment the server already made (the till shows one payment, never two). If it did not, N1's results apply. Record which happened.                                                                                                                                                                             |
| N4  | Pending: watch a payment while the server is still checking it (the mock sometimes takes minutes), or open a seeded pending payment in the history.                                                                                                                                                                                                       | "Payment is being checked" / "Being checked", never "Paid", until the server says confirmed.                                                                                                                                                                                                                                                                                                                                 |
| N5  | Pay, then put the app in the background for 1 minute, then return.                                                                                                                                                                                                                                                                                        | The result is current (polling paused and resumed); no second payment.                                                                                                                                                                                                                                                                                                                                                       |
| N6  | Process kill with a saved unresolved payment: only when a payment shows "Outcome not known yet" (from N1 or N3). Force stop (Settings → Apps → Force stop, never "Clear data"), relaunch, sign in as the same account.                                                                                                                                    | Home lists it under recent payments as "Outcome not known yet", read from the device's saved record; "Check again" and "Send again safely" work as in N2. If no payment was left unresolved, record N6 as not run: do not clear data or get around the payment gate to create one.                                                                                                                                           |
| N7  | Stay signed in for more than 5 minutes, then open the history.                                                                                                                                                                                                                                                                                            | It loads (the app signs the test account in again by itself).                                                                                                                                                                                                                                                                                                                                                                |
| N8  | With a payment left "Outcome not known yet", "Switch account" to "guest".                                                                                                                                                                                                                                                                                 | The guest sees none of staff's unfinished payments; switching back shows them again.                                                                                                                                                                                                                                                                                                                                         |
| N9  | Payment availability in the foreground (BUG-01, the Phase 1 acceptance test, build 4): keep the review screen of an open order open, switch the internet off, tap "Pay" and confirm (the check before sending fails, nothing is sent), then switch the internet on again without leaving the screen or the app. Do not pay afterwards unless you mean to. | While offline: exactly one availability warning with "Check availability again", no "Pay". Within a few seconds of the connection returning (it is read about a second after the network settles) the app reads `GET /config` by itself; once the server confirms availability, the warning disappears and "Pay" is enabled. At no time two availability warnings, or "Pay" next to a warning. Build 3 failed this (BUG-01). |

## Student: history and details (Pixel)

| #   | Steps                               | Pass when                                                                                                          |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| H1  | "Payment history".                  | Newest first; the seeded pending payment shows "Being checked"; "That is all" or "Load older payments" at the end. |
| H2  | Open a refunded payment (after T6). | Refunds with their own status, and the full history: started, confirmed, refund requested, refund completed.       |
| H3  | Airplane mode, pull to refresh.     | "No connection. The list may be incomplete." The loaded rows stay.                                                 |

## Till (iPad or Android)

| #   | Steps                                                                                                             | Pass when                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Choose "Cashier 1 · cashier-campus-1" (or type it).                                                               | Header shows the mensa and till from the server; the menu shows Student / Staff / Guest prices.                                                                                                                                                                                                                                                                                                                      |
| T2  | Add items; try more than 20 of one item.                                                                          | The "+" stops at 20; the basket shows lines and quantities, no single total.                                                                                                                                                                                                                                                                                                                                         |
| T3  | "Create order and show QR code". Rotate the iPad.                                                                 | A large QR code with a white border, the code underneath, a countdown and the server's total per group; usable in portrait and landscape.                                                                                                                                                                                                                                                                            |
| T4  | Pay it from the phone.                                                                                            | "Payment being checked" (not paid), then "Paid" with the amount and price group the payer paid. "Next customer" appears only now.                                                                                                                                                                                                                                                                                    |
| T5  | Force quit the till app while an order is open, then start it and sign in again.                                  | The open order and its QR come back; no new order can start until it is paid or expired.                                                                                                                                                                                                                                                                                                                             |
| T6  | "Payments and refunds" → the payment → refund "1,00" → "Check refund" → confirm.                                  | Refund pending, then completed; "Refundable now" drops by 1,00.                                                                                                                                                                                                                                                                                                                                                      |
| T7  | Type "1,234", "-1", "1.234,50", more than refundable.                                                             | Clear messages; "Check refund" stays disabled.                                                                                                                                                                                                                                                                                                                                                                       |
| T8  | "Refund everything left" → confirm.                                                                               | Completed; "Nothing is left to refund."                                                                                                                                                                                                                                                                                                                                                                              |
| T9  | As cashier-campus-2, look for a payment of cashier-campus-1 in "Payments and refunds" (also by searching its ID). | It is not listed. This checks the list scope only: the till's UI cannot open another till's payment by ID (search is scoped to the till, no deep links). The server's own refusal of a direct read (`GET /payments/{id}` → `403 forbidden`) is an API-level check, not a device step.                                                                                                                                |
| T10 | Offline refund: airplane mode on, confirm a refund, then airplane mode off and confirm it again.                  | Offline: "The refundable amount could not be checked, so nothing was sent." (the app reads the refundable amount just before sending, and that read fails). Online again: the refund goes through once. "Refund outcome not known" with "Send again safely" appears only if the connection drops after that read, while the request is on its way; that case is covered by simulated-server tests, not by this step. |

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
| D3  | The deployed URL (https://zahln-mensa-dashboard-4ft.pages.dev/) in a private window: sign in, 25 October 2026, a filtered list, a payment, a CSV download, Deutsch.                    | HTTPS, no sign-in carried over, the same numbers as locally, the file opens with umlauts intact. Then `pnpm dashboard:browser-check -- --url <URL>`.        |
| D4  | Open a deep link (`…/#/payments/<id>`) in a new private window.                                                                                                                        | Sign-in first, then that payment.                                                                                                                           |

## iPhone 17 Pro (Face ID)

Face ID needs a development build; Expo Go cannot show the app's Face ID permission. Steps are in
`docs/progress.md`, "Manual steps". Then repeat S8–S11 with Face ID and with "Enter Passcode".
