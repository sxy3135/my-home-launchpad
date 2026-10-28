import {readFileSync} from 'node:fs';

export const LOCAL_DATABASE_ID = '00000000-0000-0000-0000-000000000001';
export const deploymentURL = new URL('../wrangler.deploy.json', import.meta.url);

export function validateDeployment(config) {
  const db = config?.d1_databases?.[0];
  if (!/^[a-f0-9]{32}$/i.test(config?.account_id || '') ||
      !/^[a-z][a-z0-9-]{0,62}$/.test(config?.name || '') || config.name === 'my-home-local' ||
      config.main !== 'dist/server/index.js' || config.env || config.route || config.routes?.length ||
      config.workers_dev !== true || config.d1_databases?.length !== 1 || db?.binding !== 'DB' ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(db?.database_name || '') || db.database_name === 'my-home-local' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(db?.database_id || '') ||
      db.database_id === LOCAL_DATABASE_ID || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(db.database_id) ||
      db.migrations_dir !== 'drizzle') {
    throw Error('Invalid remote target. Run npm run configure:deploy with your account, Worker and a distinct remote D1. Custom routes/environments are not supported by this deployment helper.');
  }
  return config;
}

export function readDeployment() {
  let config;
  try { config = JSON.parse(readFileSync(deploymentURL, 'utf8')); }
  catch { throw Error('Create wrangler.deploy.json first: npm run configure:deploy -- --help'); }
  return validateDeployment(config);
}

export function assertDatabase(config, actual) {
  const expected = config.d1_databases[0];
  if (actual?.name !== expected.database_name || actual?.uuid !== expected.database_id) {
    throw Error('Remote D1 name/ID does not match your deployment configuration.');
  }
}

export function assertSecrets(actual) {
  const names = Array.isArray(actual) ? actual.map(item => item.name) : [];
  if (!['HOME_SECURITY_KEY', 'HOME_RECOVERY_KEY'].every(name => names.includes(name))) {
    throw Error('Configure both HOME_SECURITY_KEY and HOME_RECOVERY_KEY Secrets before deployment.');
  }
}
