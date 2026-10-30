// `pnpm toolchain`: shows which Node.js and pnpm actually run this project's commands.
// pnpm starts every script with the Node.js pinned by `useNodeVersion` in pnpm-workspace.yaml and
// puts it first on PATH, so tools started from a script (Expo CLI, Metro, Gradle's `node` calls)
// resolve the same version. pnpm itself may run on another Node.js, named in the user agent.
import { execFileSync } from 'node:child_process';

const nodeOnPath = execFileSync('node', ['--version'], { encoding: 'utf8' }).trim();

console.log(`node running scripts:     ${process.version}`);
console.log(`node that child tools use: ${nodeOnPath}`);
console.log(
  `pnpm user agent:          ${process.env.npm_config_user_agent ?? 'not started by pnpm'}`,
);
