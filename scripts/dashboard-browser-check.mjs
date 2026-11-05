// `pnpm dashboard:browser-check [-- --url <dashboard URL>] [--idle] [--screenshots <dir>]`
//
// Drives a built dashboard in headless Google Chrome against the live mock API and compares what
// the page shows with what the API returns to this script directly. Only a browser enforces CORS,
// so this is the check for a deployed origin too. Read-only: it signs in as `finance` and reads.
// A fresh Chrome profile is used, like a private window. Prints check names and counts only, never
// a token or password. `--idle` adds a 6.5-minute wait to see the session renew on the next read.
import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const dashboardUrl = new URL(option('--url') ?? 'http://localhost:4173/');
const screenshotDir = option('--screenshots');
const idle = args.includes('--idle');
const chromePath =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// The API and the demo password come from the dashboard's own build configuration.
const env = Object.fromEntries(
  readFileSync(new URL('../apps/dashboard/.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => /^VITE_\w+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]),
);
const API = env.VITE_API_BASE_URL;
const CANDIDATE = env.VITE_CANDIDATE_ID;
const PASSWORD = env.VITE_SEEDED_PASSWORD;
if (!API || !CANDIDATE || !PASSWORD) throw new Error('apps/dashboard/.env is incomplete');

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
}

// ---- the API, read directly for comparison --------------------------------------------------------

let apiToken = null;
async function api(path) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    if (!apiToken) {
      const login = await fetch(`${API}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Candidate-Id': CANDIDATE },
        body: JSON.stringify({ username: 'finance', password: PASSWORD }),
      });
      if (login.ok) apiToken = (await login.json()).accessToken;
      continue;
    }
    const response = await fetch(API + path, {
      headers: { 'X-Candidate-Id': CANDIDATE, Authorization: `Bearer ${apiToken}` },
    });
    if (response.status === 401) apiToken = null;
    else if (response.ok)
      return { body: await response.json(), date: response.headers.get('date') };
    else if (response.status < 500) throw new Error(`${path}: HTTP ${response.status}`);
    await sleep(500 * attempt);
  }
  throw new Error(`${path}: no answer`);
}

async function apiAllPayments(query) {
  const items = [];
  let cursor = null;
  do {
    const page = await api(
      `/payments?limit=200${query ? `&${query}` : ''}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    );
    items.push(...page.body.items);
    cursor = page.body.nextCursor;
  } while (cursor);
  return items;
}

const euros = (cents) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' }).format(cents / 100);
const berlinDay = (date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(date);

// ---- Chrome over the DevTools protocol ---------------------------------------------------------

const workDir = mkdtempSync(join(tmpdir(), 'mensa-browser-check-'));
const downloads = join(workDir, 'downloads');
mkdirSync(downloads);
const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${join(workDir, 'profile')}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--lang=en-GB',
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);
const browserUrl = await new Promise((resolve, reject) => {
  let output = '';
  chrome.stderr.on('data', (chunk) => {
    output += chunk;
    const match = /DevTools listening on (ws:\/\/\S+)/.exec(output);
    if (match) resolve(match[1]);
  });
  chrome.on('exit', () => reject(new Error('Chrome exited before it was ready')));
});

const socket = new WebSocket(browserUrl);
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
let messageId = 0;
const pending = new Map();
const eventHandlers = [];
socket.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data));
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  } else if (message.method) {
    for (const handler of eventHandlers) handler(message);
  }
});
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    messageId += 1;
    pending.set(messageId, { resolve, reject });
    socket.send(JSON.stringify({ id: messageId, method, params, sessionId }));
  });

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const page = (method, params) => send(method, params, sessionId);
await page('Page.enable');
await page('Runtime.enable');
await page('Network.enable');
await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
const desktop = { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false };
await page('Emulation.setDeviceMetricsOverride', desktop);

// API calls the page makes: method, path and status only.
const apiOrigin = new URL(API).origin;
const network = [];
const blocked = [];
const preflights = [];
const pageErrors = [];
let failPages = false;
eventHandlers.push((message) => {
  if (message.sessionId !== sessionId) return;
  const { params } = message;
  if (message.method === 'Network.requestWillBeSent') {
    const requestUrl = new URL(params.request.url);
    if (requestUrl.origin === apiOrigin) {
      network.push({
        id: params.requestId,
        method: params.request.method,
        path: requestUrl.pathname,
        status: null,
      });
    }
  } else if (message.method === 'Network.responseReceived') {
    const request = network.find((entry) => entry.id === params.requestId);
    if (request) request.status = params.response.status;
    if (request?.method === 'OPTIONS' || params.type === 'Preflight') {
      const headers = Object.fromEntries(
        Object.entries(params.response.headers).map(([name, value]) => [name.toLowerCase(), value]),
      );
      preflights.push({
        allowOrigin: headers['access-control-allow-origin'] ?? '',
        allowHeaders: (headers['access-control-allow-headers'] ?? '').toLowerCase(),
      });
    }
  } else if (message.method === 'Network.loadingFailed') {
    const request = network.find((entry) => entry.id === params.requestId);
    if (request && (params.corsErrorStatus || params.blockedReason)) {
      blocked.push(
        `${request.method} ${request.path}: ${params.corsErrorStatus?.corsError ?? params.blockedReason}`,
      );
    }
  } else if (message.method === 'Fetch.requestPaused') {
    // Only while the failed-page check runs; every other paused request goes on unchanged.
    void (
      failPages
        ? page('Fetch.failRequest', {
            requestId: params.requestId,
            errorReason: 'InternetDisconnected',
          })
        : page('Fetch.continueRequest', { requestId: params.requestId })
    ).catch(() => undefined);
  } else if (message.method === 'Runtime.exceptionThrown') {
    pageErrors.push(params.exceptionDetails.text);
  }
});

async function evaluate(expression) {
  const { result, exceptionDetails } = await page('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (exceptionDetails)
    throw new Error(`page: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`);
  return result.value;
}

/** Runs `expression` as if the person had just clicked (transient user activation). */
async function evaluateAsUser(expression) {
  const { result } = await page('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  return result.value;
}

async function waitFor(expression, label, timeout = 30_000) {
  const until = Date.now() + timeout;
  for (;;) {
    const value = await evaluate(expression);
    if (value) return value;
    if (Date.now() > until) throw new Error(`timed out waiting for ${label}`);
    await sleep(200);
  }
}

const go = async (hash) => {
  await evaluate(`location.hash = ${JSON.stringify(hash)}`);
  await sleep(100);
};
const heading = () => evaluate(`document.querySelector('h1')?.textContent ?? ''`);
const clickScript = (text) => `(() => {
    const button = [...document.querySelectorAll('button, a')].find((node) => node.textContent.trim() === ${JSON.stringify(text)});
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`;
const clickAsUser = (text) => evaluateAsUser(clickScript(text));
const clickButton = (text) =>
  evaluate(`(() => {
    const button = [...document.querySelectorAll('button, a')].find((node) => node.textContent.trim() === ${JSON.stringify(text)});
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`);
const setField = (selector, value) =>
  evaluate(`(() => {
    const field = document.querySelector(${JSON.stringify(selector)});
    const prototype = field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, ${JSON.stringify(value)});
    field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    return field.value;
  })()`);
const tableRows = (scope) =>
  // Whitespace normalised: visually hidden context (e.g. a till's mensa) arrives on its own line.
  evaluate(
    `[...document.querySelectorAll('${scope} tbody tr')].map((row) => [...row.querySelectorAll('th, td')].map((cell) => cell.innerText.replace(/\\s+/g, ' ').trim()))`,
  );
const status = (scope) =>
  evaluate(`document.querySelector('${scope} [role=status]')?.textContent ?? ''`);

/** Clicks "Load more" until the list says it is complete, waiting for each page to arrive. */
async function loadAll(scope) {
  for (;;) {
    const count = await evaluate(`document.querySelectorAll('${scope} tbody tr').length`);
    if (!(await clickButton('Load more'))) return;
    await waitFor(
      `document.querySelectorAll('${scope} tbody tr').length > ${count} || !!document.querySelector('${scope} [role=alert]')`,
      'the next page',
    );
  }
}

async function screenshot(name) {
  if (!screenshotDir) return;
  const { data } = await page('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
  });
  writeFileSync(join(screenshotDir, `${name}.png`), Buffer.from(data, 'base64'));
}

async function signIn() {
  await waitFor(`!!document.querySelector('main button')`, 'the sign-in button');
  await clickButton('Sign in with the finance account');
  await waitFor(`!!document.querySelector('nav')`, 'the signed-in layout');
}

// ---- checks --------------------------------------------------------------------------------------

async function reportMatches(day) {
  await go(`#/report?day=${day}`);
  await waitFor(
    `document.querySelector('[role=status]')?.textContent.startsWith('Last fetched')`,
    `report ${day}`,
  );
  const { body: report } = await api(`/reports/daily-totals?date=${day}`);
  const rows = await tableRows('section[aria-labelledby=report-places]');
  const expected = report.mensas.flatMap((mensa) => [
    [mensa.mensa.name, mensa],
    ...mensa.tills.map((till) => [`${till.till.name} (${mensa.mensa.name})`, till]),
  ]);
  const rowText = (totals) => [
    String(totals.paymentCount),
    euros(totals.grossCents),
    euros(totals.refundedCents),
    euros(totals.netCents),
    String(totals.pendingCount),
    euros(totals.pendingCents),
  ];
  const tableOk =
    rows.length === expected.length &&
    expected.every(([label, totals], index) => {
      const row = rows[index];
      return (
        row[0] === label && rowText(totals).every((value, column) => row[column + 1] === value)
      );
    });
  const figures = await evaluate(
    `[...document.querySelectorAll('dl[aria-label] dd[data-amount]')].map((cell) => cell.innerText.trim())`,
  );
  const figuresOk =
    JSON.stringify(figures) ===
    JSON.stringify(
      [report.grossCents, report.refundedCents, report.netCents, report.pendingCents].map(euros),
    );
  const sums = [report, ...report.mensas, ...report.mensas.flatMap((mensa) => mensa.tills)].every(
    (totals) => totals.netCents === totals.grossCents - totals.refundedCents,
  );
  check(
    `daily totals ${day} equal the report response (overall, ${report.mensas.length} mensas, tills)`,
    tableOk && figuresOk,
    `gross ${euros(report.grossCents)}, refunds ${euros(report.refundedCents)}, net ${euros(report.netCents)}`,
  );
  check(`report ${day}: net = gross − completed refunds at every level`, sums);
  return report;
}

try {
  await page('Page.navigate', { url: new URL('#/report?day=2026-10-25', dashboardUrl).href });
  check(
    'dashboard served over ' + dashboardUrl.protocol.replace(':', ''),
    true,
    dashboardUrl.origin,
  );
  await signIn();
  check(
    'sign-in with the public demo account opens the requested route',
    (await heading()) === 'Daily totals',
  );
  const stored = await evaluate(
    `localStorage.length + sessionStorage.length + document.cookie.length`,
  );
  check('no token or password in localStorage, sessionStorage or cookies', stored === 0);

  const sunday = await reportMatches('2026-10-25');
  check(
    'a cross-day refund gives a negative net on 25 October 2026',
    sunday.netCents < 0,
    euros(sunday.netCents),
  );
  await screenshot('report-2026-10-25');
  await reportMatches('2026-10-23');

  await go('#/report');
  const today = await waitFor(`document.querySelector('#report-day')?.value`, 'the default day');
  const { date: serverDate } = await api('/reports/daily-totals');
  check(
    "the report opens on today's Berlin date by server time",
    today === berlinDay(new Date(serverDate)),
    today,
  );

  await go('#/attention');
  await waitFor(
    `/End of the list|loaded so far/.test(document.body.innerText)`,
    'the attention list',
  );
  const flagged = await apiAllPayments('needsAttention=true');
  const attentionRows = await tableRows('section[aria-labelledby=attention-list]');
  const attentionIds = attentionRows.map((row) => row[2].replace('Open payment ', ''));
  check(
    'attention list equals needsAttention=true',
    attentionIds.join() === flagged.map((payment) => payment.id).join(),
    `${attentionRows.length} payments`,
  );
  const confirmedFlagged = flagged.filter((payment) => payment.status === 'confirmed');
  check(
    'a flagged confirmed payment keeps its status label (not "Declined")',
    confirmedFlagged.every((payment) =>
      attentionRows[attentionIds.indexOf(payment.id)]?.[3].includes('Confirmed'),
    ),
    `${confirmedFlagged.length} confirmed among them`,
  );
  await screenshot('attention');

  await go('#/transactions');
  await waitFor(`document.body.innerText.includes('50 payments loaded so far')`, 'the first page');
  await clickButton('Load more');
  await waitFor(
    `document.body.innerText.includes('100 payments loaded so far')`,
    'the second page',
  );
  const listed = await tableRows('section[aria-labelledby=transactions-list]');
  const firstHundred = (await api('/payments?limit=100')).body.items.map((payment) => payment.id);
  const listedIds = listed.map((row) => row[1].replace('Open payment ', ''));
  check(
    'paging follows nextCursor: 2 pages, 100 distinct payments, newest first',
    listedIds.join() === firstHundred.join() && new Set(listedIds).size === 100,
  );
  check(
    'the count says "loaded so far", not a total, while more pages exist',
    (await status('section[aria-labelledby=transactions-list]')).includes('loaded so far'),
  );

  const filters = [
    ['status=pending', 'status=pending'],
    [
      'mensa=mensa_nord&till=till_nord_2&from=2026-10-23&to=2026-10-23',
      `mensaId=mensa_nord&tillId=till_nord_2&from=${encodeURIComponent('2026-10-23T00:00:00+02:00')}&to=${encodeURIComponent('2026-10-24T00:00:00+02:00')}`,
    ],
    [
      'attention=no&status=declined&from=2026-10-01&to=2026-10-31',
      `needsAttention=false&status=declined&from=${encodeURIComponent('2026-10-01T00:00:00+02:00')}&to=${encodeURIComponent('2026-11-01T00:00:00+01:00')}`,
    ],
    ['q=pay_76', 'q=pay_76'],
  ];
  for (const [hash, query] of filters) {
    await go(`#/transactions?${hash}`);
    await waitFor(
      `/End of the list|loaded so far|No payment matches/.test(document.querySelector('section[aria-labelledby=transactions-list] [role=status]')?.textContent ?? '')`,
      hash,
    );
    await loadAll('section[aria-labelledby=transactions-list]');
    const rows = await tableRows('section[aria-labelledby=transactions-list]');
    const expected = await apiAllPayments(query);
    const ids = rows.map((row) => row[1].replace('Open payment ', ''));
    check(
      `filter ${hash} shows exactly the API's matching payments`,
      ids.join() === expected.map((payment) => payment.id).join(),
      `${ids.length} payments`,
    );
  }

  await go('#/transactions');
  await waitFor(
    `!!document.querySelector('#filter-mensa option[value=mensa_campus]')`,
    'mensas in the filter',
  );
  await setField('#filter-mensa', 'mensa_campus');
  await setField('#filter-till', 'till_campus_2');
  await setField('#filter-mensa', 'mensa_nord');
  check(
    'choosing another mensa clears a till of the previous mensa',
    (await evaluate(`document.querySelector('#filter-till').value`)) === '',
  );
  await setField('#filter-status', 'confirmed');
  await setField('#filter-from', '2026-10-26');
  await setField('#filter-to', '2026-10-25');
  check(
    'a reversed day range is refused before any request',
    (await evaluate(`document.querySelector('button[type=submit]').disabled`)) === true,
  );
  await setField('#filter-to', '2026-10-27');
  await clickButton('Apply filters');
  await waitFor(`location.hash.includes('status=confirmed')`, 'the applied filter in the address');
  check(
    'Apply writes only the active filters to the address',
    (await evaluate('location.hash')) ===
      '#/transactions?mensa=mensa_nord&status=confirmed&from=2026-10-26&to=2026-10-27',
  );

  // Keyboard only, with real key events: Tab reaches every control of the payments page in
  // document order, each with a visible focus indicator; every field has a name; Enter follows a link.
  await go('#/transactions');
  await waitFor(`/loaded so far|End of the list/.test(document.body.innerText)`, 'the payments');
  const controlCount = await evaluate(`(() => {
    window.__controls = [...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')]
      .filter((node) => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length > 0);
    // Tab starts after the focused element: start from the top of the document, not from the
    // button clicked last (Chrome keeps that as its starting point even after a blur).
    document.body.tabIndex = -1;
    document.body.focus();
    document.body.removeAttribute('tabindex');
    return window.__controls.length;
  })()`);
  const pressKey = async (key, keyCode, text) => {
    await page('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code: key,
      windowsVirtualKeyCode: keyCode,
      text,
    });
    await page('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code: key,
      windowsVirtualKeyCode: keyCode,
    });
  };
  const reached = [];
  const unmarked = [];
  // A date field takes one Tab per part (day, month, year): count each control once.
  for (let presses = 0; reached.length < controlCount && presses < controlCount * 4; presses += 1) {
    await pressKey('Tab', 9);
    const step = await evaluate(`(() => {
      const node = document.activeElement;
      const style = getComputedStyle(node);
      const ring = (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== 'none';
      return { at: window.__controls.indexOf(node), ring, name: (node.getAttribute('aria-label') || node.id || node.textContent || node.tagName).trim().slice(0, 40) };
    })()`);
    if (step.at === reached.at(-1)) continue;
    reached.push(step.at);
    if (!step.ring) unmarked.push(step.name);
  }
  check(
    'keyboard only: Tab reaches every control of the payments page in document order',
    reached.every((at, index) => at === index),
    `${controlCount} controls`,
  );
  check(
    'keyboard only: every focused control shows a visible focus indicator',
    unmarked.length === 0,
    unmarked.slice(0, 5).join(', '),
  );
  const unnamed = await evaluate(
    `[...document.querySelectorAll('input, select, textarea')].filter((field) => !(field.labels?.length || field.getAttribute('aria-label') || field.getAttribute('aria-labelledby'))).map((field) => field.id || field.name)`,
  );
  check('every field has a label', unnamed.length === 0, unnamed.join(', '));
  await evaluate(`(() => {
    const link = [...document.querySelectorAll('nav a')].find((node) => node.getAttribute('href')?.startsWith('#/report'));
    link?.focus();
    return !!link;
  })()`);
  await pressKey('Enter', 13, '\r');
  const followed = await waitFor(`location.hash.startsWith('#/report')`, 'Enter', 5_000).then(
    () => true,
    () => false,
  );
  check('keyboard only: Enter on a navigation link opens it', followed);

  await go('#/transactions?from=2026-10-23&to=2026-10-23');
  await waitFor(
    `/loaded so far|End of the list/.test(document.body.innerText)`,
    'the filtered list',
  );
  const exportVisible = await evaluate(`(() => {
    const button = [...document.querySelectorAll('main button')].find((node) => node.textContent.trim() === 'Export CSV');
    const title = document.querySelector('h1');
    if (!button || !title) return false;
    const box = button.getBoundingClientRect();
    return box.top >= 0 && box.bottom <= innerHeight && box.top - title.getBoundingClientRect().top < 160 &&
      button.getAttribute('aria-describedby') === 'export-scope' &&
      document.getElementById('export-scope').textContent.includes('all pages');
  })()`);
  check(
    'the Export CSV action is visible next to the page heading and says it covers every page of the applied filters',
    exportVisible,
  );
  const before = readdirSync(downloads).length;
  // Started like a person's click: the file is saved at once, no second click needed.
  await clickAsUser('Export CSV');
  await waitFor(
    `document.body.innerText.includes('Export complete')`,
    'the filtered export',
    120_000,
  );
  await sleep(1_500);
  check(
    'a quick export saves its file at once and names it with the count',
    (await evaluate(
      `/Export complete: [\\d,]+ payments from [\\d,]+ pages\\.[\\s\\S]*The browser is saving mensa-payments_2026-10-23_to_2026-10-23/.test(document.body.innerText)`,
    )) === true,
  );
  const file = readdirSync(downloads).find((name) => name.includes('2026-10-23_to_2026-10-23'));
  const dayExpected = await apiAllPayments(
    `from=${encodeURIComponent('2026-10-23T00:00:00+02:00')}&to=${encodeURIComponent('2026-10-24T00:00:00+02:00')}`,
  );
  const csv = file ? readFileSync(join(downloads, file), 'utf8') : '';
  const lines = csv.split('\r\n').filter(Boolean);
  check(
    'filtered CSV: byte order mark, header, one row per matching payment (2 pages of 200 max)',
    readdirSync(downloads).length === before + 1 &&
      csv.startsWith('﻿payment_id,order_id,created_at') &&
      lines.length - 1 === dayExpected.length,
    `${file ?? 'no file'}, ${lines.length - 1} rows`,
  );

  await go('#/transactions');
  await waitFor(`/loaded so far/.test(document.body.innerText)`, 'the full list');
  // Let the earlier click's user activation run out (Chrome keeps it for 5 seconds), so this
  // export finishes without a recent click, like a long export does.
  await sleep(6_000);
  const beforeFull = readdirSync(downloads).length;
  // Started without a fresh click (as after a long export): the page must not download by
  // itself, but offer the file with one click of the person.
  await clickButton('Export CSV');
  await waitFor(`document.body.innerText.includes('Export ready')`, 'the full export', 300_000);
  await sleep(1_500);
  const heldBack = readdirSync(downloads).length === beforeFull;
  await clickAsUser('Save CSV file');
  await waitFor(
    `document.body.innerText.includes('The browser is saving')`,
    'the saved full export',
  );
  await sleep(2_000);
  check(
    'a long export offers "Save CSV file" instead of a download the browser may hold back',
    heldBack && readdirSync(downloads).length === beforeFull + 1,
  );
  const fullFile = readdirSync(downloads).find((name) => !name.includes('_to_'));
  const fullCsv = fullFile ? readFileSync(join(downloads, fullFile), 'utf8') : '';
  const exportedIds = fullCsv
    .split('\r\n')
    .slice(1)
    .filter(Boolean)
    .map((line) => line.slice(0, line.indexOf(',')));
  const independent = await apiAllPayments('');
  check(
    'full CSV export equals an independent traversal of every page',
    exportedIds.length === independent.length &&
      exportedIds.join() === independent.map((payment) => payment.id).join(),
    `${exportedIds.length} payments in ${Math.ceil(independent.length / 200)} pages`,
  );
  const shownDone = await evaluate(
    // The counts are written in the reader's language (5,595): compared without separators.
    `document.body.innerText.match(/Export (?:complete|ready): ([\\d,]+) payments from ([\\d,]+) pages/)?.slice(1).map((part) => part.replaceAll(',', '')).join('/') ?? ''`,
  );
  check(
    'the export reports its page and payment counts',
    shownDone === `${exportedIds.length}/${Math.ceil(independent.length / 200)}`,
    shownDone,
  );

  const filesBefore = readdirSync(downloads);
  await clickButton('Export CSV');
  await waitFor(`document.body.innerText.includes('Exporting:')`, 'a running export');
  await clickButton('Cancel export');
  await waitFor(
    `document.body.innerText.includes('Export cancelled. No file was saved.')`,
    'the cancellation',
  );
  await clickButton('Export CSV');
  await waitFor(`document.body.innerText.includes('Exporting:')`, 'a second running export');
  await go('#/transactions?status=declined');
  await waitFor(
    `document.body.innerText.includes('Export cancelled because the filters changed')`,
    'the filter cancellation',
  );
  await sleep(3_000);
  // Export files only (also half-written ones): headless Chrome can leave a stray downloads.html.crdownload.
  const newFiles = readdirSync(downloads).filter(
    (name) => !filesBefore.includes(name) && /^mensa-payments.*\.csv/.test(name),
  );
  check(
    'a cancelled export, or one overtaken by a new filter, saves no file',
    newFiles.length === 0,
    newFiles.join(', '),
  );

  // A page that cannot be read: every request for a following page fails, as offline. The export
  // must fail as a whole, say why, offer "Try again" and save nothing.
  await go('#/transactions');
  await waitFor(`/loaded so far/.test(document.body.innerText)`, 'the full list again');
  const beforeFailure = readdirSync(downloads).length;
  failPages = true;
  await page('Fetch.enable', { patterns: [{ urlPattern: '*/payments?*cursor=*' }] });
  await clickAsUser('Export CSV');
  const failedShown = await waitFor(
    `document.body.innerText.includes('The export failed.')`,
    'the failed export',
    120_000,
  ).then(
    () => true,
    () => false,
  );
  await page('Fetch.disable');
  failPages = false;
  await sleep(1_500);
  check(
    'a page that cannot be read fails the whole export with a reason, "Try again" and no file',
    failedShown &&
      readdirSync(downloads).length === beforeFailure &&
      (await evaluate(
        `document.body.innerText.includes('No file was saved') && [...document.querySelectorAll('button')].some((node) => node.textContent.trim() === 'Try again')`,
      )) === true,
  );

  await go('#/payments/pay_90d914f2be37a714?back=%23%2Ftransactions');
  await waitFor(
    `!!document.querySelector('section[aria-labelledby=payment-history] ol')`,
    'the payment history',
  );
  const { body: detail } = await api('/payments/pay_90d914f2be37a714');
  const history = await evaluate(
    `[...document.querySelectorAll('section[aria-labelledby=payment-history] li')].length`,
  );
  const refunds = await tableRows('section[aria-labelledby=payment-refunds]');
  check(
    'payment detail shows every refund and the full history in server order',
    history === detail.history.length &&
      refunds.length === detail.refunds.length &&
      refunds.every((row) => row[2].includes('Refund completed')),
    `${refunds.length} refunds, ${history} events`,
  );
  await screenshot('payment-detail');
  await go('#/payments/pay_doesnotexist');
  await waitFor(
    `document.body.innerText.includes('The server knows no payment with this ID.')`,
    'the not-found message',
  );
  check(
    'an unknown payment ID gives a readable message, not raw problem JSON',
    !(await evaluate(`document.body.innerText.includes('"code"')`)),
  );

  await clickButton('Deutsch');
  await go('#/report?day=2026-10-25');
  await waitFor(`document.querySelector('h1')?.textContent === 'Tagessummen'`, 'the German report');
  check(
    'German UI with <html lang="de">',
    (await evaluate('document.documentElement.lang')) === 'de',
  );
  await waitFor(
    `document.querySelector('[role=status]')?.textContent.startsWith('Zuletzt abgerufen')`,
    'German report status',
  );
  await screenshot('report-de');
  await clickButton('English');

  await page('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  for (const hash of [
    '#/report?day=2026-10-23',
    '#/transactions',
    '#/payments/pay_90d914f2be37a714',
  ]) {
    await go(hash);
    await sleep(1_500);
    const overflow = await evaluate('document.documentElement.scrollWidth - window.innerWidth');
    check(`no sideways page scroll at 390 px: ${hash}`, overflow <= 0, `${overflow}px`);
    if (hash === '#/transactions') {
      const cards = await evaluate(
        `getComputedStyle(document.querySelector('section[aria-labelledby=transactions-list] ul')).display !== 'none' && document.querySelectorAll('section[aria-labelledby=transactions-list] ul li').length`,
      );
      check(
        'payments are cards with amount and status on a phone, not a sideways table',
        cards >= 50,
        `${cards} cards`,
      );
    }
    await screenshot(`mobile-${hash.split(/[/?]/)[1]}`);
  }
  await page('Emulation.setDeviceMetricsOverride', desktop);

  await go('#/payments/pay_90d914f2be37a714');
  await page('Page.reload');
  await sleep(1_000);
  const signInAgain = await evaluate(`document.querySelector('h1')?.textContent === 'Sign in'`);
  await signIn();
  check(
    'a reload asks to sign in again, then opens the deep-linked payment',
    signInAgain && (await heading()) === 'Payment pay_90d914f2be37a714',
  );

  if (idle) {
    await go('#/report?day=2026-10-23');
    await waitFor(
      `document.querySelector('[role=status]')?.textContent.startsWith('Last fetched')`,
      'the report',
    );
    console.log('      waiting 6.5 minutes for the token to expire…');
    await sleep(390_000);
    const mark = network.length;
    await clickButton('Refresh');
    await waitFor(
      `document.querySelector('[role=status]')?.textContent.startsWith('Last fetched')`,
      'the refreshed report',
      60_000,
    );
    const after = network
      .slice(mark)
      .map((entry) => `${entry.method} ${entry.path} ${entry.status}`);
    check(
      'after 6.5 idle minutes the next read signs in again by itself and succeeds',
      after.some((line) => line.startsWith('POST /sessions 201')) && after.at(-1)?.endsWith(' 200'),
      after.join(' → '),
    );
  }

  await clickButton('Sign out');
  await waitFor(`document.querySelector('h1')?.textContent === 'Sign in'`, 'the sign-in page');
  check(
    'sign-out returns to sign-in and leaves nothing stored',
    (await evaluate(`localStorage.length + sessionStorage.length`)) === 0,
  );

  const counts = {};
  for (const entry of network) {
    const key = `${entry.method === 'OPTIONS' ? 'preflight' : entry.method} ${entry.status ?? 'none'}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  check(
    'no browser request was blocked by CORS',
    network.length > 0 && blocked.length === 0,
    blocked.join(' | ') || JSON.stringify(counts),
  );
  // The API allows exactly the headers a preflight asks for: Content-Type + X-Candidate-Id for the
  // login, Authorization + X-Candidate-Id for every authenticated read.
  const allowed = (header) =>
    preflights.filter((preflight) => preflight.allowHeaders.split(',').includes(header));
  check(
    'preflights allow X-Candidate-Id on every request and Authorization on authenticated reads',
    preflights.length > 0 &&
      allowed('x-candidate-id').length === preflights.length &&
      allowed('authorization').length > 0,
    `${preflights.length} preflights, allow-origin ${[...new Set(preflights.map((preflight) => preflight.allowOrigin))].join(', ')}`,
  );
  check('no uncaught errors in the page', pageErrors.length === 0, pageErrors.join(' | '));
} catch (error) {
  check('browser run finished', false, error instanceof Error ? error.message : String(error));
  await screenshot('failure').catch(() => undefined);
} finally {
  socket.close();
  chrome.kill();
  await sleep(300);
  if (existsSync(workDir)) rmSync(workDir, { recursive: true, force: true });
}

const failures = results.filter((result) => !result.ok).length;
console.log(`\n${results.length - failures}/${results.length} checks passed`);
process.exit(failures === 0 ? 0 : 1);
