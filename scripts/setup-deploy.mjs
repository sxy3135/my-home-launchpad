import {existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';
import {cloudflareEnvironment} from './cloudflare.mjs';
import {validateDeployment, assertDatabase} from './deployment-config.mjs';

const projectRoot=resolve(import.meta.dirname,'..');
function privateJson(path,value,exclusive=false) {
  writeFileSync(path,JSON.stringify(value,null,2)+'\n',{flag:exclusive?'wx':'w',mode:0o600});
}
export async function setupDeployment({root=projectRoot,run,ask,log=console.log}={}) {
  const configPath=join(root,'wrangler.deploy.json'), statePath=join(root,'.wrangler/setup-state.json');
  const secretPath=join(root,'.wrangler/deploy-secrets.json');
  if(existsSync(configPath)&&!existsSync(statePath)) {
    validateDeployment(JSON.parse(readFileSync(configPath,'utf8')));
    log('Deployment is configured. Use npm run deploy to update it.');return;
  }
  if(!existsSync(statePath)&&existsSync(secretPath)) throw Error('Deployment keys already exist. Restore their matching wrangler.deploy.json before setting up another target.');
  let identity=run(['whoami','--json'],{capture:true});
  if(identity.status!==0) {
    run(['login']);identity=run(['whoami','--json'],{capture:true});
  }
  if(identity.status!==0)throw Error('Cloudflare login failed. Run npm run cf -- login and try again.');
  const accounts=JSON.parse(identity.stdout).accounts||[];
  if(!accounts.length)throw Error('No Cloudflare account is available.');
  let state;
  if(existsSync(statePath)) state=JSON.parse(readFileSync(statePath,'utf8'));
  else {
    let selected=accounts[0];
    if(accounts.length>1) {
      accounts.forEach((account,i)=>log((i+1)+'. '+account.name));
      selected=accounts[Number(await ask('Cloudflare account number: '))-1];
    }
    if(!selected)throw Error('Choose a valid account number.');
    const name=(await ask('Worker name [my-home]: ')).trim()||'my-home';
    if(!/^[a-z][a-z0-9-]{0,59}$/.test(name)||name==='my-home-local')throw Error('Use a new Worker name with lowercase letters, digits, and hyphens (up to 60 characters).');
    const env={CLOUDFLARE_ACCOUNT_ID:selected.id};
    const probe=run(['secret','list','--name',name,'--format','json'],{capture:true,env});
    if(probe.status===0)throw Error('That Worker already exists. Choose a new name; existing deployments are not overwritten.');
    if(!(probe.stderr+'\n'+probe.stdout).includes('Worker "'+name+'" not found.')) throw Error('Could not verify the Worker name. Check Cloudflare access before retrying.');
    log('Create Worker '+name+' and D1 '+name+'-db in '+selected.name+'.');
    if(!/^y(?:es)?$/i.test((await ask('Create and deploy these resources? [y/N] ')).trim())) {log('Setup cancelled.');return;}
    state={account:selected.id,name,database:name+'-db',phase:'create-database'};
    mkdirSync(join(root,'.wrangler'),{recursive:true,mode:0o700});
    const base=JSON.parse(readFileSync(join(root,'wrangler.jsonc'),'utf8').replace(/^\/\/.*$/gm,''));
    base.account_id=selected.id;base.name=name;base.d1_databases=[];
    privateJson(configPath,base,true);privateJson(statePath,state,true);
  }
  if(!accounts.some(account=>account.id===state.account)) throw Error('Sign in to the account used for this setup.');
  const config=JSON.parse(readFileSync(configPath,'utf8'));
  if(config.name!==state.name||config.account_id!==state.account)throw Error('Setup state and deployment configuration differ. Restore the intended target before continuing.');
  const options=['--config',configPath],env={CLOUDFLARE_ACCOUNT_ID:state.account};
  const command=args=>{
    const result=run([...args,...options],{env});
    if(result.status!==0)throw Error('Setup stopped at '+args.slice(0,2).join(' ')+'. Your keys and configuration are preserved; check the error before retrying.');
  };
  if(state.phase==='create-database') {
    command(['d1','create',state.database,'--binding','DB','--update-config']);
    state.phase='database-created';privateJson(statePath,state);
  }
  const generated=JSON.parse(readFileSync(configPath,'utf8'));
  if(generated.d1_databases?.length===1&&generated.d1_databases[0].binding==='DB'&&generated.d1_databases[0].database_name===state.database) generated.d1_databases[0].migrations_dir='drizzle';
  const ready=validateDeployment(generated);
  privateJson(configPath,ready);
  const actual=run(['d1','info',state.database,'--json',...options],{capture:true,env});
  if(actual.status!==0)throw Error('Could not verify the new database.');
  assertDatabase(ready,JSON.parse(actual.stdout));
  command(['d1','migrations','apply',state.database,'--remote']);
  if(!existsSync(secretPath)) privateJson(secretPath,{HOME_SECURITY_KEY:randomBytes(32).toString('base64url'),HOME_RECOVERY_KEY:randomBytes(32).toString('base64url')},true);
  const secrets=JSON.parse(readFileSync(secretPath,'utf8'));
  if(![secrets.HOME_SECURITY_KEY,secrets.HOME_RECOVERY_KEY].every(v=>typeof v==='string'&&/^[A-Za-z0-9_-]{43}$/.test(v))||secrets.HOME_SECURITY_KEY===secrets.HOME_RECOVERY_KEY)throw Error('Invalid saved deployment keys. Restore the original keys; do not replace them to retry setup.');
  command(['deploy','--secrets-file',secretPath]);
  unlinkSync(statePath);
  log('Deployment complete. Keep .wrangler/deploy-secrets.json private. Use its HOME_RECOVERY_KEY to set your password on the first visit.');
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.argv.slice(2).some(value=>value!=='--help')||process.argv.length>3) {console.error('Usage: npm run setup:deploy');process.exitCode=1;}
  else if(process.argv.includes('--help')) console.log('npm run setup:deploy\nGuided Cloudflare login, account selection, new D1 setup, key generation, and first deployment. Existing Workers are never selected for replacement.');
  else {
    const readline=createInterface({input:process.stdin,output:process.stdout});
    try {
      const env={...cloudflareEnvironment(),NO_COLOR:'1'};
      const cli=join(projectRoot,'node_modules/wrangler/bin/wrangler.js');
      await setupDeployment({ask:question=>readline.question(question),run:(args,{capture=false,env:extra={}}={})=>{
        readline.pause();
        try {
          const result=spawnSync(process.execPath,[cli,...args],{cwd:projectRoot,env:{...env,...extra},...(capture?{encoding:'utf8'}:{stdio:'inherit'})});
          return {...result,stdout:result.stdout||'',stderr:result.stderr||''};
        } finally {readline.resume();}
      }});
    } catch(error) {console.error(error.message);process.exitCode=1;}
    finally {readline.close();}
  }
}
