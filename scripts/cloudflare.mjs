import {mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve, dirname, delimiter} from 'node:path';

const root = new URL('../', import.meta.url);
export function cloudflareEnvironment() {
  const config = fileURLToPath(new URL('.wrangler/config', root));
  const logs = fileURLToPath(new URL('.wrangler/logs', root));
  mkdirSync(config, {recursive: true, mode: 0o700});
  mkdirSync(logs, {recursive: true, mode: 0o700});
  return {...process.env,
    // Wrangler custom builds spawn bare `node`; preserve the runtime used by this wrapper.
    PATH: [dirname(process.execPath), process.env.PATH].filter(Boolean).join(delimiter),
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME || config,
    WRANGLER_LOG_PATH: process.env.WRANGLER_LOG_PATH || resolve(logs, 'cli.log'),
    WRANGLER_SEND_METRICS: process.env.WRANGLER_SEND_METRICS || 'false'};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url)), ...process.argv.slice(2)],
    {cwd: root, env: cloudflareEnvironment(), stdio: 'inherit'});
  process.exit(result.status ?? 1);
}
