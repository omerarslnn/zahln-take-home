// `pnpm check:copies`: the student app and the till keep identical copies of their shared native
// code (design-system primitives, payment wiring, building blocks), because a shared React Native
// package would need its own copy of react-native and NativeWind resolution (docs/design-system.md).
// This proves the copies match: every listed file must exist in both apps and be the same, apart
// from the leading comment that names the other copy. Only listed paths are compared, so the
// apps' legitimate differences (screens, navigation, App.tsx) never fail it.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const apps = { student: join(root, 'apps/student'), till: join(root, 'apps/till') };

/** Paths relative to each app. A folder covers every file in it, except tests and `except`. */
const SHARED = [
  { path: 'metro.config.js' },
  { path: 'tailwind.config.js' },
  { path: 'babel.config.js' },
  { path: 'global.css' },
  { path: 'src/api.ts' },
  { path: 'src/payments', except: ['connectivity.ts'] },
  { path: 'src/components/ui' },
  { path: 'src/components/LanguageSetting.tsx' },
  { path: 'src/language.tsx' },
  { path: 'src/components/payment-text.ts' },
  { path: 'src/components/sign-in-text.ts' },
  { path: 'src/components/SignIn.tsx' },
  { path: 'src/components/PaymentDetails.tsx' },
  { path: 'src/components/SecureStorageCheck.tsx' },
  { path: 'src/components/ConnectionCheck.tsx' },
  { path: 'src/screens/DesignCatalogueScreen.tsx' },
];

/** Drops the leading `//` comment lines (and blank lines between them): the header may differ. */
function body(file) {
  const lines = readFileSync(file, 'utf8').split('\n');
  let start = 0;
  while (start < lines.length && /^(\/\/.*)?$/.test(lines[start].trim())) start += 1;
  return lines.slice(start).join('\n');
}

function filesUnder(app, entry) {
  const base = join(apps[app], entry.path);
  if (!existsSync(base)) return [];
  if (!statSync(base).isDirectory()) return [entry.path];
  return readdirSync(base, { recursive: true })
    .map(String)
    .filter((name) => statSync(join(base, name)).isFile())
    .filter((name) => !/\.test\.tsx?$/.test(name) && !(entry.except ?? []).includes(name))
    .map((name) => relative(apps[app], join(base, name)));
}

const problems = [];
let compared = 0;
for (const entry of SHARED) {
  const student = new Set(filesUnder('student', entry));
  const till = new Set(filesUnder('till', entry));
  if (student.size === 0 && till.size === 0) problems.push(`${entry.path}: missing in both apps`);
  for (const file of new Set([...student, ...till])) {
    if (!student.has(file) || !till.has(file)) {
      problems.push(`${file}: only in apps/${student.has(file) ? 'student' : 'till'}`);
      continue;
    }
    compared += 1;
    if (body(join(apps.student, file)) !== body(join(apps.till, file))) {
      problems.push(`${file}: the copies differ (apart from the header comment)`);
    }
  }
}

if (problems.length > 0) {
  console.error(`Native copies out of sync:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  console.error('Change both copies (see CLAUDE.md, "identical copies").');
  process.exit(1);
}
console.log(`Native copies: ${compared} files identical in apps/student and apps/till`);
