import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,existsSync,mkdirSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setupDeployment} from '../scripts/setup-deploy.mjs';
import {spawnSync} from 'node:child_process';

function setup() {
  const root=mkdtempSync(join(tmpdir(),'home-first-deploy-')),calls=[],logs=[];
  copyFileSync(new URL('../wrangler.jsonc',import.meta.url),join(root,'wrangler.jsonc'));
  const id='12345678-1234-1234-1234-123456789abc',account='a'.repeat(32);
  const run=(args)=>{
    calls.push(args);
    if(args[0]==='whoami')return {status:0,stdout:JSON.stringify({accounts:[{id:account,name:'Example account'}]}),stderr:''};
    if(args[0]==='secret')return {status:1,stdout:'',stderr:'Worker "example-home" not found.'};
    if(args[0]==='d1'&&args[1]==='create') {
      const path=args[args.indexOf('--config')+1],config=JSON.parse(readFileSync(path));
      config.d1_databases=[{binding:'DB',database_name:'example-home-db',database_id:id}];writeFileSync(path,JSON.stringify(config));
    }
    if(args[0]==='d1'&&args[1]==='info')return {status:0,stdout:JSON.stringify({name:'example-home-db',uuid:id}),stderr:''};
    return {status:0,stdout:'',stderr:''};
  };
  const answers=['example-home','y'];
  return {root,calls,logs,run,options:{root,run,ask:async()=>answers.shift(),log:text=>logs.push(text)},clean:()=>rmSync(root,{recursive:true,force:true})};
}
test('first deployment creates and binds D1, generates private keys, migrates and uploads without printing secrets',async()=>{
  const f=setup();try {
    await setupDeployment(f.options);
    const path=join(f.root,'.wrangler/deploy-secrets.json'),keys=JSON.parse(readFileSync(path));
    assert.notEqual(keys.HOME_SECURITY_KEY,keys.HOME_RECOVERY_KEY);assert.equal(keys.HOME_SECURITY_KEY.length,43);
    assert(!f.logs.join('\n').includes(keys.HOME_SECURITY_KEY));assert(!f.logs.join('\n').includes(keys.HOME_RECOVERY_KEY));
    assert(f.calls.some(c=>c[0]==='deploy'&&c.includes('--secrets-file')));
    assert(f.calls.some(c=>c[1]==='migrations'&&c.includes('--remote')));
    assert.equal(JSON.parse(readFileSync(join(f.root,'wrangler.deploy.json'))).d1_databases[0].migrations_dir,'drizzle');
    assert(!existsSync(join(f.root,'.wrangler/setup-state.json')));
    const count=f.calls.length;await setupDeployment(f.options);assert.equal(f.calls.length,count);assert.equal(readFileSync(path,'utf8').includes(keys.HOME_SECURITY_KEY),true);
  } finally {f.clean();}
});
test('setup refuses existing Workers and stops on ambiguous Cloudflare errors',async()=>{
  for(const result of [{status:0,stdout:'[]',stderr:''},{status:1,stdout:'',stderr:'Network unavailable'}]) {
    const f=setup();try {
      await assert.rejects(setupDeployment({...f.options,run:args=>args[0]==='secret'?result:f.run(args)}));
      assert(!existsSync(join(f.root,'wrangler.deploy.json')));assert(!f.calls.some(c=>c[0]==='deploy'||c[1]==='create'));
    }finally{f.clean();}
  }
});
test('a cancelled setup creates no configuration or resources',async()=>{
  const f=setup();try {
    let step=0;await setupDeployment({...f.options,ask:async()=>step++?'n':'example-home'});
    assert(!existsSync(join(f.root,'wrangler.deploy.json')));assert(!f.calls.some(c=>c[1]==='create'));
  }finally{f.clean();}
});

test('retrying a failed first deployment preserves encryption and recovery keys',async()=>{
  const f=setup();try {
    await assert.rejects(setupDeployment({...f.options,run:args=>args[0]==='deploy'?{status:1,stdout:'',stderr:'Connection failed'}:f.run(args)}));
    const path=join(f.root,'.wrangler/deploy-secrets.json'),keys=readFileSync(path,'utf8');
    assert(existsSync(join(f.root,'.wrangler/setup-state.json')));
    await setupDeployment({...f.options,ask:async()=>{throw Error('A retry must use the saved target');}});
    assert.equal(readFileSync(path,'utf8'),keys);assert.equal(f.calls.filter(c=>c[0]==='d1'&&c[1]==='create').length,1);
  }finally{f.clean();}
});
test('startup prepares local data before launching and stops after a migration failure',()=>{
  const root=mkdtempSync(join(tmpdir(),'home-start-'));
  try {
    mkdirSync(join(root,'scripts'));copyFileSync(new URL('../scripts/start.mjs',import.meta.url),join(root,'scripts/start.mjs'));
    const stub=name=>writeFileSync(join(root,'scripts',name),`import {appendFileSync} from 'node:fs';appendFileSync(process.env.MYHOME_START_LOG,${JSON.stringify(name)}+' '+process.argv.slice(2).join(' ')+'\\n');if(process.env.MYHOME_FAIL_MIGRATION&&process.argv.includes('migrations'))process.exit(1);`);
    for(const name of ['create-local-secrets.mjs','cloudflare.mjs','build-static.mjs'])stub(name);
    const log=join(root,'calls');
    const run=(fail=false)=>spawnSync(process.execPath,[join(root,'scripts/start.mjs'),'--prepare'],{encoding:'utf8',env:{...process.env,MYHOME_START_LOG:log,...(fail?{MYHOME_FAIL_MIGRATION:'1'}:{})}});
    assert.equal(run().status,0);let calls=readFileSync(log,'utf8');assert(calls.includes('--local'));assert(!calls.includes('--remote'));assert(calls.indexOf('migrations')<calls.indexOf('build-static'));
    writeFileSync(log,'');assert.notEqual(run(true).status,0);assert(!readFileSync(log,'utf8').includes('build-static'));
  }finally{rmSync(root,{recursive:true,force:true});}
});
