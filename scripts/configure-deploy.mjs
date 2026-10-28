import {writeFileSync} from 'node:fs';
import {parseArgs} from 'node:util';
import {deploymentURL, validateDeployment} from './deployment-config.mjs';

const {values} = parseArgs({options: {
  account: {type:'string'}, worker: {type:'string'}, database: {type:'string'},
  'database-id': {type:'string'}, help: {type:'boolean'}
}});
if (values.help) {
  console.log('npm run configure:deploy -- --account <ACCOUNT_ID> --worker <WORKER_NAME> --database <D1_NAME> --database-id <D1_UUID>\nCreates ignored wrangler.deploy.json without overwriting an existing file.');
} else {
  const config = validateDeployment({
    $schema:'node_modules/wrangler/config-schema.json', account_id:values.account, name:values.worker,
    main:'dist/server/index.js', compatibility_date:'2026-10-12', workers_dev:true, preview_urls:false,
    build:{command:'node scripts/build-static.mjs'},
    d1_databases:[{binding:'DB', database_name:values.database, database_id:values['database-id'], migrations_dir:'drizzle'}]
  });
  writeFileSync(deploymentURL, JSON.stringify(config, null, 2)+'\n', {flag:'wx', mode:0o600});
  console.log('Created ignored wrangler.deploy.json for '+config.name+'. Existing configurations are never overwritten.');
}
