import {writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';

// Local development only. Exclusive creation prevents rotating an existing encryption key.
try {
  await writeFile(new URL('../.dev.vars', import.meta.url),
    `HOME_SECURITY_KEY=${randomBytes(32).toString('base64url')}\nHOME_RECOVERY_KEY=${randomBytes(32).toString('base64url')}\n`,
    {flag: 'wx', mode: 0o600});
  console.log('Created ignored .dev.vars (owner read/write only). Local keys must not be reused for deployment.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('Existing .dev.vars preserved.');
}
