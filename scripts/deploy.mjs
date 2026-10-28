import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {cloudflareEnvironment} from './cloudflare.mjs';
import {readDeployment, deploymentURL, assertDatabase, assertSecrets} from './deployment-config.mjs';

const flags = process.argv.slice(2);
if (flags.length > 1 || (flags.length === 1 && flags[0] !== '--migrate')) throw Error('Usage: npm run deploy OR npm run db:migrate:remote');
const config = readDeployment(), database = config.d1_databases[0];
const root = new URL('../', import.meta.url), env = cloudflareEnvironment();
const cli = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const options = ['--config', fileURLToPath(deploymentURL)];
function run(args, json = false) {
  const result = spawnSync(process.execPath, [cli, ...args, ...options], {cwd:root, env, ...(json ? {encoding:'utf8'} : {stdio:'inherit'})});
  if (result.error || result.status !== 0) throw Error('Cloudflare command failed: '+args.slice(0,2).join(' '));
  if (json) {
    try { return JSON.parse(result.stdout); } catch { throw Error('Cloudflare returned an unreadable target check.'); }
  }
}
assertDatabase(config, run(['d1','info',database.database_name,'--json'], true));
console.log('Verified target: Worker '+config.name+'; D1 '+database.database_name+' ('+database.database_id+').');
if (flags[0] === '--migrate') {
  run(['d1','migrations','apply',database.database_name,'--remote']);
} else {
  assertSecrets(run(['secret','list'], true));
  run(['deploy']); // Deliberately never applies database migrations.
}
