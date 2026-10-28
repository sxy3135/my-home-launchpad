import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {validateDeployment, assertDatabase, assertSecrets, LOCAL_DATABASE_ID} from '../scripts/deployment-config.mjs';

const target = () => ({account_id:'a'.repeat(32),name:'example-home',main:'dist/server/index.js',workers_dev:true,
  d1_databases:[{binding:'DB',database_name:'example-home-db',database_id:'12345678-1234-1234-1234-123456789abc',migrations_dir:'drizzle'}]});
test('deployment rejects missing/ambiguous/local targets and checks actual remote database identity', () => {
  const c=target();assert.equal(validateDeployment(c),c);
  for (const bad of [{}, {...c,account_id:''}, {...c,name:'my-home-local'}, {...c,env:{}}, {...c,route:'example.com/*'}, {...c,routes:['example.com/*']},
    {...c,d1_databases:[...c.d1_databases,...c.d1_databases]}, {...c,d1_databases:[{...c.d1_databases[0],database_id:LOCAL_DATABASE_ID}]}]) assert.throws(()=>validateDeployment(bad));
  const db=c.d1_databases[0];assert.doesNotThrow(()=>assertDatabase(c,{name:db.database_name,uuid:db.database_id}));
  assert.throws(()=>assertDatabase(c,{name:db.database_name,uuid:'wrong'}));
  assert.throws(()=>assertDatabase(c,{name:'wrong',uuid:db.database_id}));
  assert.throws(()=>assertSecrets([{name:'HOME_SECURITY_KEY'}]));
  assert.doesNotThrow(()=>assertSecrets([{name:'HOME_SECURITY_KEY'},{name:'HOME_RECOVERY_KEY'}]));
});

test('configuration CLI rejects incomplete input and never overwrites an existing remote target', () => {
  const dir=mkdtempSync(join(tmpdir(),'home-config-'));
  try {
    mkdirSync(join(dir,'scripts'));
    for (const name of ['configure-deploy.mjs','deployment-config.mjs']) copyFileSync(new URL('../scripts/'+name,import.meta.url),join(dir,'scripts',name));
    const cli=join(dir,'scripts/configure-deploy.mjs'), file=join(dir,'wrangler.deploy.json');
    const run=args=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});
    assert.notEqual(run([]).status,0);assert(!existsSync(file));
    const c=target(),db=c.d1_databases[0];
    const args=['--account',c.account_id,'--worker',c.name,'--database',db.database_name,'--database-id',db.database_id];
    assert.equal(run(args).status,0);const first=readFileSync(file,'utf8');assert.equal(JSON.parse(first).name,c.name);
    assert.notEqual(run(args).status,0);assert.equal(readFileSync(file,'utf8'),first);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('deployment process stops before publishing on wrong D1 or missing secrets; migration never deploys', () => {
  const dir=mkdtempSync(join(tmpdir(),'home-deploy-'));
  try {
    mkdirSync(join(dir,'scripts'));
    mkdirSync(join(dir,'node_modules/wrangler/bin'),{recursive:true});
    for (const name of ['deploy.mjs','deployment-config.mjs','cloudflare.mjs']) copyFileSync(new URL('../scripts/'+name,import.meta.url),join(dir,'scripts',name));
    writeFileSync(join(dir,'wrangler.deploy.json'),JSON.stringify(target()));
    writeFileSync(join(dir,'node_modules/wrangler/bin/wrangler.js'),`
const fs=require('node:fs'),args=process.argv.slice(2);
fs.appendFileSync(process.env.MYHOME_TEST_CALLS,JSON.stringify(args)+'\\n');
if(args[0]==='d1'&&args[1]==='info')console.log(JSON.stringify({name:'example-home-db',uuid:process.env.MYHOME_TEST_CASE==='wrong-db'?'wrong':'12345678-1234-1234-1234-123456789abc'}));
else if(args[0]==='secret')console.log(JSON.stringify(process.env.MYHOME_TEST_CASE==='missing-secrets'?[]:[{name:'HOME_SECURITY_KEY'},{name:'HOME_RECOVERY_KEY'}]));
`);
    const file=join(dir,'calls.jsonl');
    const run=(mode,args=[])=>{
      writeFileSync(file,'');
      const result=spawnSync(process.execPath,[join(dir,'scripts/deploy.mjs'),...args],{encoding:'utf8',env:{...process.env,MYHOME_TEST_CASE:mode,MYHOME_TEST_CALLS:file}});
      const calls=readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(x=>JSON.parse(x));
      return {result,calls};
    };
    for (const mode of ['wrong-db','missing-secrets']) {
      const {result,calls}=run(mode);assert.notEqual(result.status,0);assert(!calls.some(c=>c[0]==='deploy'));
    }
    const published=run('ok');assert.equal(published.result.status,0);assert(published.calls.some(c=>c[0]==='deploy'));
    const migration=run('ok',['--migrate']);assert.equal(migration.result.status,0);
    assert(migration.calls.some(c=>c[0]==='d1'&&c[1]==='migrations'&&c.includes('--remote')));
    assert(!migration.calls.some(c=>c[0]==='deploy'||c[0]==='secret'));
  } finally {rmSync(dir,{recursive:true,force:true});}
});
