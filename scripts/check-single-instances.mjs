// `pnpm check:instances`: fails when the workspace holds two copies of a package that must exist
// once per app bundle. pnpm makes a second copy when peer dependencies differ between apps (for
// example an optional peer installed in one app only). Two copies of react-native-css-interop
// split NativeWind's style registry: third-party JSX used one copy, app code the other, and class
// names on remapped components (KeyboardAvoidingView, list containers) silently stopped working.
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const MUST_BE_SINGLE = ['react', 'react-native', 'react-native-css-interop', 'nativewind'];
const store = join(resolve(import.meta.dirname, '..'), 'node_modules', '.pnpm');
const entries = readdirSync(store);

let failed = false;
for (const name of MUST_BE_SINGLE) {
  const copies = entries.filter((entry) => entry.startsWith(`${name.replace('/', '+')}@`));
  if (copies.length !== 1) {
    failed = true;
    console.error(`${name}: ${copies.length} copies in node_modules/.pnpm (expected 1)`);
    for (const copy of copies) console.error(`  ${copy}`);
  }
}
if (failed) process.exit(1);
console.log(`Single instances: ${MUST_BE_SINGLE.join(', ')}`);
