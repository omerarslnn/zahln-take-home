/**
 * Opt-in: `pnpm api:spec-diff` downloads the live OpenAPI document and compares it semantically
 * (parsed JSON, so formatting does not matter) with the committed contract. The committed file is
 * never modified: differences are printed so they can be reviewed and recorded in docs/api-notes.md.
 *
 * Exit codes: 0 identical, 1 different, 2 live document unavailable.
 */
import { readFileSync } from 'node:fs';

const LIVE_URL = process.env.ZAHLN_OPENAPI_URL ?? 'https://dev.zahln.de/openapi.json';
const committed = JSON.parse(
  readFileSync(new URL('../openapi/openapi.json', import.meta.url), 'utf8'),
) as unknown;

let live: unknown;
try {
  const response = await fetch(LIVE_URL, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  live = await response.json();
} catch (error) {
  console.error(`Could not load ${LIVE_URL}: ${String(error)}`);
  process.exit(2);
}

const differences: string[] = [];
compare(committed, live, '');

if (differences.length === 0) {
  console.log(`Live spec at ${LIVE_URL} is semantically identical to openapi/openapi.json.`);
  process.exit(0);
}
console.log(`${differences.length} difference(s) between openapi/openapi.json and ${LIVE_URL}:\n`);
for (const difference of differences) console.log(difference);
process.exit(1);

function compare(left: unknown, right: unknown, path: string): void {
  if (JSON.stringify(left) === JSON.stringify(right)) return;
  if (isObject(left) && isObject(right)) {
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
      const childPath = `${path}/${key}`;
      if (!(key in left)) differences.push(`+ ${childPath} (only live): ${preview(right[key])}`);
      else if (!(key in right))
        differences.push(`- ${childPath} (only committed): ${preview(left[key])}`);
      else compare(left[key], right[key], childPath);
    }
    return;
  }
  differences.push(
    `~ ${path || '/'}\n    committed: ${preview(left)}\n    live:      ${preview(right)}`,
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function preview(value: unknown): string {
  const text = JSON.stringify(value) ?? 'undefined';
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}
