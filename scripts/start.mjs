import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=new URL('../',import.meta.url);
const args=process.argv.slice(2);
if(args.some(value=>value!=='--prepare')||args.length>1) throw Error('Usage: npm start OR npm run setup');
const run=(file,values=[],extraEnv={})=>{
  const result=spawnSync(process.execPath,[fileURLToPath(new URL(file,root)),...values],{cwd:root,stdio:'inherit',env:{...process.env,...extraEnv}});
  if(result.error||result.status!==0) process.exit(result.status||1);
};
run('scripts/create-local-secrets.mjs');
run('scripts/cloudflare.mjs',['d1','migrations','apply','my-home-local','--local'],{CI:'1'});
if(args.includes('--prepare')) run('scripts/build-static.mjs');
else {
  console.log('Starting My Home at http://localhost:8787\nFirst visit: use HOME_RECOVERY_KEY from .dev.vars to choose your password.');
  run('scripts/cloudflare.mjs',['dev','--local','--ip','127.0.0.1']);
}
