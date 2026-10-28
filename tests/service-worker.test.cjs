const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const source=fs.readFileSync(require('node:path').resolve(__dirname,'../dist/sw.js'),'utf8');
const VERSION=source.match(/VERSION="([^"]+)"/)[1],PROGRAM=source.match(/PROGRAM="([^"]+)"/)[1],DIGEST=source.match(/DIGEST="([^"]+)"/)[1];
const html=fs.readFileSync(require('node:path').resolve(__dirname,'../dist'+PROGRAM),'utf8');
function storage(){const maps=new Map();return {maps,async open(name){if(!maps.has(name))maps.set(name,new Map());const map=maps.get(name);return {async put(key,response){map.set(String(key),response.clone())},async match(key){return map.get(String(key))?.clone()}}},async keys(){return [...maps.keys()]},async delete(key){return maps.delete(key)}}}
function worker({caches=storage(),active=null,version=VERSION,program=PROGRAM,body=html,network,failPut=false}={}){
 const events={},calls=[];let skipped=0,claimed=0;
 const modified=source.replace('VERSION="'+VERSION+'"','VERSION="'+version+'"').replace('PROGRAM="'+PROGRAM+'"','PROGRAM="'+program+'"').replace('DIGEST="'+DIGEST+'"','DIGEST="'+crypto.createHash('sha256').update(body).digest('hex')+'"');
 const ctx={URL,Response,Date,crypto:crypto.webcrypto,caches,self:{location:{origin:'https://home.test'},registration:{active},skipWaiting:async()=>{skipped++},clients:{claim:async()=>{claimed++}},addEventListener:(type,fn)=>events[type]=fn},fetch:async(request,options)=>{calls.push({url:typeof request==='string'?request:request.url,options});return network?network(request,options):new Response(body,{headers:{'X-MyHome-Program':version}})}};
 vm.createContext(ctx);vm.runInContext(modified,ctx);
 const lifecycle=async type=>{let p;events[type]({waitUntil:value=>p=value});return p};
 const fetchEvent=async(path,mode='navigate',method='GET')=>{let response,waits=[];events.fetch({request:{url:'https://home.test'+path,mode,method},respondWith:p=>response=p,waitUntil:p=>waits.push(p)});return {response:response&&await response,waits}};
 return {caches,calls,events,lifecycle,fetchEvent,skipped:()=>skipped,claimed:()=>claimed};
}
test('installation caches only a verified complete generic program, claims first install, then serves / and /fast without any network wait',async()=>{
 const w=worker();await w.lifecycle('install');assert.equal(w.skipped(),1);await w.lifecycle('activate');assert.equal(w.claimed(),1);assert.equal(w.calls.length,1);assert.equal(w.calls[0].options.credentials,'omit');
 w.calls.length=0;for(const path of ['/','/fast','/index.html','/fast.html','/login']){const {response}=await w.fetchEvent(path);assert.equal(await response.text(),html)}assert.equal(w.calls.length,0);
 // A new worker instance after browser/process restart reuses persistent cache bytes.
 const restarted=worker({caches:w.caches,active:{}});assert.equal(await (await restarted.fetchEvent('/fast')).response.text(),html);assert.equal(restarted.calls.length,0);
});
test('APIs, login POST, connection settings, unrelated pages and explicit online fallback are never intercepted or stored',async()=>{
 const w=worker();await w.lifecycle('install');for(const p of ['/api/auth/login','/api/auth/logout','/api/auth/session','/api/reader/inbox','/api/reader/sync','/api/reader/settings','/reader-setup.html','/password-reset','/daily-note.json','/daily.js','/?online=1'])assert.equal((await w.fetchEvent(p)).response,undefined,p);
 assert.equal((await w.fetchEvent('/login','navigate','POST')).response,undefined);assert.equal((await w.fetchEvent('/api/reader/inbox','cors')).response,undefined);
 for(const map of w.caches.maps.values())for(const key of map.keys())assert(!key.startsWith('/api/'));
});
test('failed download/digest/quota retains the full old version, successful update waits for old pages and bounded cleanup preserves active cache',async()=>{
 const caches=storage(),old=worker({caches});await old.lifecycle('install');await old.lifecycle('activate');
 for(const kind of ['network','hash','quota']){
  const failed=worker({caches,active:{},version:'next-'+kind,program:'/app-shell.next-'+kind+'.html',network:async()=>{if(kind==='network')throw Error('offline');return new Response(kind==='hash'?'truncated':html,{headers:{'X-MyHome-Program':'next-'+kind}})}});
  if(kind==='quota'){const open=caches.open.bind(caches);caches.open=async name=>{const cache=await open(name);return name==='myhome-program-next-quota'?{...cache,put:async()=>{throw Error('quota')}}:cache}}
  await assert.rejects(failed.lifecycle('install'));assert(caches.maps.has('myhome-program-'+VERSION));assert(!caches.maps.has('myhome-program-next-'+kind));
 }
 const update=worker({caches,active:{},version:'next-success',program:'/app-shell.next-success.html'});await update.lifecycle('install');assert.equal(update.skipped(),0);assert(caches.maps.has('myhome-program-'+VERSION));
 const newer=worker({caches,active:{},version:'newest',program:'/app-shell.newest.html'});await newer.lifecycle('install');assert(!caches.maps.has('myhome-program-next-success'));assert(caches.maps.has('myhome-program-'+VERSION));
 assert.equal(await (await old.fetchEvent('/')).response.text(),html);await newer.lifecycle('activate');assert(!caches.maps.has('myhome-program-'+VERSION));assert(caches.maps.has('myhome-program-newest'));assert.equal((await caches.keys()).length,2);
});
test('missing files fall back to network without mixing versions; unavailable network returns a usable recovery message',async()=>{
 const w=worker({network:async request=>typeof request==='string'?new Response(html,{headers:{'X-MyHome-Program':VERSION}}):new Response('online authenticated page')});await w.lifecycle('install');w.caches.maps.get('myhome-program-'+VERSION).delete(PROGRAM);
 const result=await w.fetchEvent('/');assert.equal(await result.response.text(),'online authenticated page');await Promise.all(result.waits);assert(w.caches.maps.get('myhome-program-'+VERSION).has(PROGRAM));
 const offline=worker({network:async()=>{throw Error('offline')}});const failed=await offline.fetchEvent('/');assert.equal(failed.response.status,503);assert((await failed.response.text()).includes('配置仍保留'));await Promise.all(failed.waits);
});

test('repair of an evicted active program cannot delete the fully installed waiting update',async()=>{
 const caches=storage(),old=worker({caches});await old.lifecycle('install');await old.lifecycle('activate');
 const candidate=worker({caches,active:{},version:'waiting',program:'/app-shell.waiting.html'});await candidate.lifecycle('install');
 caches.maps.get('myhome-program-'+VERSION).delete(PROGRAM);
 const event=await old.fetchEvent('/');await Promise.all(event.waits);assert(caches.maps.has('myhome-program-waiting'));assert(caches.maps.get('myhome-program-'+VERSION).has(PROGRAM));
});
