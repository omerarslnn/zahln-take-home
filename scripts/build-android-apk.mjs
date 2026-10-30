// `pnpm apk:student` / `pnpm apk:till`: builds a standalone release APK locally.
//
// "Standalone" means the JavaScript bundle is compiled to Hermes bytecode and embedded in the APK,
// so it runs without Metro. The APK is signed with the debug keystore that `expo prebuild` generates:
// installable for review and testing, but not a Play Store build and not updatable by a build signed
// with a different key. The generated android/ folder is disposable and git-ignored.
//
// ANDROID_ABIS selects CPU architectures. The default covers 64- and 32-bit ARM phones, because some
// low-end devices run a 32-bit userspace. Use ANDROID_ABIS=arm64-v8a for a faster emulator-only build.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const app = process.argv[2];
if (app !== 'student' && app !== 'till') {
  console.error('Usage: node scripts/build-android-apk.mjs <student|till>');
  process.exit(2);
}

const root = resolve(import.meta.dirname, '..');
const appDir = join(root, 'apps', app);
const abis = process.env.ANDROID_ABIS ?? 'armeabi-v7a,arm64-v8a';
const version = JSON.parse(readFileSync(join(appDir, 'app.json'), 'utf8')).expo.version;

if (!existsSync(join(appDir, '.env'))) {
  console.error(
    `apps/${app}/.env is missing. Run \`pnpm env:init\` first: the bundle needs its public API settings.`,
  );
  process.exit(2);
}

// React Native 0.81 needs JDK 17. A machine-wide `org.gradle.java.home` (for example an old entry in
// ~/.gradle/gradle.properties) would beat JAVA_HOME, so the JDK is passed on the command line, which
// takes precedence, for this build only. ANDROID_JAVA_HOME overrides the lookup.
const javaHome = process.env.ANDROID_JAVA_HOME ?? findJdk17();

run(
  join(appDir, 'node_modules', '.bin', 'expo'),
  ['prebuild', '--platform', 'android', '--clean', '--no-install'],
  appDir,
);
run(
  './gradlew',
  [
    'assembleRelease',
    `-PreactNativeArchitectures=${abis}`,
    ...(javaHome ? [`-Dorg.gradle.java.home=${javaHome}`] : []),
  ],
  join(appDir, 'android'),
);

const builtApk = join(
  appDir,
  'android',
  'app',
  'build',
  'outputs',
  'apk',
  'release',
  'app-release.apk',
);
const outDir = join(root, 'artifacts', 'android');
const outApk = join(outDir, `mensa-${app}-${version}-${abis.replaceAll(',', '+')}.apk`);
mkdirSync(outDir, { recursive: true });
copyFileSync(builtApk, outApk);
console.log(`\nStandalone APK: ${outApk}\nInstall with: adb install -r "${outApk}"`);

/** macOS: ask java_home for an installed JDK 17; elsewhere fall back to JAVA_HOME. */
function findJdk17() {
  const lookup = spawnSync('/usr/libexec/java_home', ['-v', '17'], { encoding: 'utf8' });
  return lookup.status === 0 ? lookup.stdout.trim() : process.env.JAVA_HOME;
}

function run(command, args, cwd) {
  console.log(`\n> ${command} ${args.join(' ')}  (in ${cwd})`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
