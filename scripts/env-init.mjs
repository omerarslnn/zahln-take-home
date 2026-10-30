// `pnpm env:init`: copies each committed .env.example to .env where no .env exists yet.
// It never overwrites an existing .env, so local edits are safe.
import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const directories = ['.', 'apps/student', 'apps/till', 'apps/dashboard'];

for (const directory of directories) {
  const example = join(directory, '.env.example');
  const target = join(directory, '.env');
  if (!existsSync(example)) continue;
  if (existsSync(target)) {
    console.log(`kept     ${target}`);
  } else {
    copyFileSync(example, target);
    console.log(`created  ${target}`);
  }
}
