const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {harness,Evt,root}=require('./fixtures/dom.cjs'),seed=require('./fixtures/config.json');
const TRUST='myhome.device.v1',BLOCK='myhome.device.lock.v1',PENDING='myhome.logout.pending.v1',CONFIG='my-home-launchpad.config.v1';
const future=()=>({version:1,revision:1,expiresAt:Date.now()+86400000});
const grant=()=>({authenticated:true,revision:1,expiresAt:Date.now()+86400000});
const settle=async()=>{for(let i=0;i<40;i++)await Promise.resolve()};
function fixture({trusted=false,store,serverGrant,online=false,handler}={}){
 const h=harness(),timers=new Map(),calls=[];let id=0;
 if(store)for(const [k,v] of store)h.store.set(k,v);
 if(trusted&&!h.store.has(TRUST))h.store.set(TRUST,JSON.stringify(future()));
 if(trusted&&!h.store.has(CONFIG))h.store.set(CONFIG,JSON.stringify(seed.config));
 h.ctx.window.navigator={onLine:online};h.ctx.window.isSecureContext=false;h.ctx.window.crypto=h.ctx.crypto;
 h.ctx.window.location={replace:url=>{h.location=url}};
 h.ctx.setTimeout=(fn,ms)=>{timers.set(++id,{fn,ms});return id};h.ctx.clearTimeout=i=>timers.delete(i);h.ctx.clearInterval=()=>{};
 h.ctx.fetch=async(path,options)=>{calls.push({path,options});return handler?handler(path,options):Response.json({error:'unavailable'},{status:503})};
 h.ctx.window.fetch=h.ctx.fetch;
 delete h.ctx.window.HomeDevice;
 if(serverGrant){const e=h.doc.createElement('script');e.id='home-server-grant';e.textContent=JSON.stringify(serverGrant);h.doc.documentElement.prepend(e)}
 const load=()=>h.run(root+'/src/frontend/device.js');
 const core=()=>{const html=fs.readFileSync(root+'/dist/index.html','utf8'),file=html.match(/data-home-bundle="([^"]+)"/)[1];h.run(root+'/dist/'+file)};
 const ready=()=>h.doc.dispatchEvent(new Evt('DOMContentLoaded'));
 return {...h,timers,calls,load,core,ready,get location(){return h.location},device:()=>h.ctx.window.HomeDevice};
}
test('trusted restart renders complete local configuration immediately without any server or Reader response',async()=>{
 const f=fixture({trusted:true});f.store.set('myhome.appearance.v1','{"minute":1140}');
 f.load();assert(f.device().unlocked);assert.equal(f.calls.length,0);f.core();f.ready();
 assert.equal(f.doc.querySelectorAll('.course-card').length,7);assert(f.doc.getElementById('home-clock').textContent.match(/^\d\d:\d\d$/));
 assert(f.doc.getElementById('home-date').textContent);assert.equal(f.doc.documentElement.getAttribute('data-device'),'trusted');
 for(const [,t] of [...f.timers])if(t.ms===80)t.fn();await settle();assert.equal(f.calls.length,0);
 const second=fixture({store:f.store});second.load();second.core();second.ready();assert(second.device().unlocked);assert.equal(second.doc.querySelectorAll('.course-card').length,7);assert.equal(second.calls.length,0);
});
test('untrusted, expired and explicitly logged-out devices never initialize personal UI, even with an old server cookie grant',()=>{
 for(const kind of ['new','expired','logout','pending']){
  const f=fixture({trusted:kind!=='new'});
  if(kind==='expired')f.store.set(TRUST,JSON.stringify({...future(),expiresAt:Date.now()-1000}));
  if(kind==='logout')f.store.set(BLOCK,'{"at":1}');if(kind==='pending')f.store.set(PENDING,'{"id":"old","at":1}');
  if(kind!=='new'){const e=f.doc.createElement('script');e.id='home-server-grant';e.textContent=JSON.stringify(grant());f.doc.documentElement.prepend(e)}
  f.load();f.core();assert(!f.device().unlocked,kind);assert.equal(f.doc.querySelectorAll('.course-card').length,0);assert.equal(f.calls.length,0);assert.equal(f.doc.documentElement.getAttribute('data-device'),'locked');
 }
});
test('a verified live grant initializes missing data once and preserves existing edits, order, sizes and independent settings',()=>{
 const f=fixture({serverGrant:grant()});f.load();assert(f.device().unlocked);assert.deepEqual(JSON.parse(f.store.get(CONFIG)),seed.config);
 const c=JSON.parse(f.store.get(CONFIG));c.semesters[0].courses.reverse();c.semesters[0].courses[0].name='My edited course';c.panelSizes={learning:{width:42,height:51}};c.customFutureField={value:9};
 f.store.set(CONFIG,JSON.stringify(c));f.store.set('myhome.appearance.v1','{"minute":900}');f.store.set('myhome.search-engine','bing');const before=f.store.get(CONFIG);
 const next=fixture({store:f.store,serverGrant:grant()});next.load();next.core();assert.deepEqual(JSON.parse(next.store.get(CONFIG)),JSON.parse(JSON.stringify(next.ctx.window.HomeModel.restoreConfig(JSON.parse(before)))));assert(next.doc.getElementById('courses').textContent.includes('My edited course'));
 next.doc.getElementById('edit-button').click();next.doc.querySelectorAll('.course-launch')[0].click();next.doc.getElementById('field-name').value='Second edit';next.doc.getElementById('editor-form').dispatchEvent(new Evt('submit'));
 const saved=JSON.parse(next.store.get(CONFIG));assert.deepEqual(saved.panelSizes,c.panelSizes);assert.deepEqual(saved.customFutureField,c.customFutureField);assert.equal(next.store.get('myhome.appearance.v1'),'{"minute":900}');assert.equal(next.store.get('myhome.search-engine'),'bing');
});
test('offline logout locks immediately, removes rendered data, retains configuration, and later flushes without restoring trust',async()=>{
 const f=fixture({trusted:true});f.load();f.core();f.ready();const config=f.store.get(CONFIG);
 f.device().logout();assert(!f.device().unlocked);assert.equal(f.store.has(TRUST),false);assert(f.store.has(PENDING));assert(f.store.has(BLOCK));assert.equal(f.store.get(CONFIG),config);assert.equal(f.doc.querySelectorAll('.course-card').length,0);assert.equal(f.calls.length,0);
 const next=fixture({store:f.store,serverGrant:grant(),online:true,handler:path=>{assert.equal(path,'/api/auth/logout');return Response.json({loggedOut:true})}});next.load();next.core();next.ready();await settle();assert(!next.device().unlocked);assert.equal(next.calls.length,1);assert(!next.store.has(PENDING));assert(next.store.has(BLOCK));assert.equal(next.store.get(CONFIG),config);
 const restarted=fixture({store:next.store,serverGrant:grant()});restarted.load();assert(!restarted.device().unlocked);
});
test('remote checks coalesce; disconnect, timeout and 5xx preserve trust, while explicit revocation/revision changes lock',async()=>{
 for(const result of ['offline','server','401','403','revision']){
  const f=fixture({trusted:true,online:true,handler:async()=>{if(result==='offline')throw Error('offline');if(result==='server')return Response.json({error:'unavailable'},{status:503});if(result==='revision')return Response.json({authenticated:true,revision:2,expiresAt:Date.now()+86400000});return Response.json({authenticated:false},{status:Number(result)})}});
  f.load();f.core();const a=f.device().checkSession(),b=f.device().checkSession();await Promise.all([a,b]);assert.equal(f.calls.length,1);
  assert.equal(f.device().unlocked,result==='offline'||result==='server',result);assert.equal(f.store.has(TRUST),f.device().unlocked);assert(f.store.has(CONFIG));
 }
 const f=fixture({trusted:true,online:true,handler:(_,o)=>new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>reject(Error('timeout'))))});f.load();const task=f.device().checkSession();await settle();[...f.timers.values()].find(t=>t.ms===8000).fn();await task;assert(f.device().unlocked);
});
test('another tab locks without storage feedback loops; page restoration cannot revive a logged-out session',()=>{
 const a=fixture({trusted:true}),b=fixture({trusted:true});a.load();a.core();a.ready();b.load();b.core();b.ready();a.device().logout();
 b.store.delete(TRUST);b.store.set(BLOCK,a.store.get(BLOCK));b.store.set(PENDING,a.store.get(PENDING));const writes=b.writes.length;
 b.ctx.window.dispatchEvent(new Evt('storage',{key:BLOCK,newValue:b.store.get(BLOCK)}));assert(!b.device().unlocked);assert.equal(b.writes.length,writes);assert.equal(b.doc.querySelectorAll('.course-card').length,0);
 b.ctx.window.dispatchEvent(new Evt('pagehide'));b.ctx.window.dispatchEvent(new Evt('pageshow'));assert(!b.device().unlocked);
});
test('only successful password POST can restore a locally blocked device; pending logout is completed first',async()=>{
 const calls=[],f=fixture({online:true,handler:(p,o)=>{calls.push(p);return p==='/api/auth/logout'?Response.json({loggedOut:true}):Response.json(grant())}});
 f.store.set(BLOCK,'{"at":1}');f.store.set(PENDING,'{"id":"old","at":1}');f.load();f.ready();await settle();
 const form=f.doc.querySelector('form[action="/api/auth/login"]');f.doc.getElementById('device-password').value='Not stored';form.dispatchEvent(new Evt('submit',{currentTarget:form}));await settle();
 assert.deepEqual(calls,['/api/auth/logout','/api/auth/login']);assert(f.device().unlocked);assert.equal(f.location,'/');assert(!f.store.has(PENDING));assert(!f.store.has(BLOCK));assert.equal(f.doc.getElementById('device-password').value,'');assert(![...f.store.values()].some(v=>v.includes('Not stored')));
});
test('storage write failure retains online usability and bypasses a controlling local cache for the next navigation',async()=>{
 const f=fixture({online:true,handler:()=>Response.json(grant())});f.ctx.localStorage.setItem=()=>{throw Error('storage unavailable')};f.load();f.ready();const form=f.doc.querySelector('form[action="/api/auth/login"]');f.doc.getElementById('device-password').value='Not stored';form.dispatchEvent(new Evt('submit',{currentTarget:form}));await settle();assert(f.device().unlocked);assert.equal(f.location,'/?online=1');assert(!f.store.has(TRUST));
});

test('setup and change forms send recovery/current credentials only in POST, clear inputs and never persist them',async()=>{
 for(const [path,field] of [['/api/auth/password','recovery'],['/api/auth/change-password','current']]){
  const f=fixture({online:true,handler:(p,o)=>{assert.equal(p,path);const body=new URLSearchParams(o.body);assert.equal(body.get(field),'Sensitive test credential');assert.equal(body.get('confirm'),'New test password');return Response.json(grant())}});
  const form=f.doc.querySelector('form[action="/api/auth/login"]');form.setAttribute('action',path);
  for(const name of ['confirm',field]){const e=f.doc.createElement('input');e.setAttribute('name',name);e.value=name==='confirm'?'New test password':'Sensitive test credential';form.append(e)}
  f.load();f.ready();f.doc.getElementById('device-password').value='New test password';form.dispatchEvent(new Evt('submit',{currentTarget:form}));await settle();
  assert.equal(f.calls.length,1);assert.equal(form.querySelector('input[name="'+field+'"]').value,'');assert(![...f.store.values()].some(v=>v.includes('Sensitive test credential')));assert(f.device().unlocked);
 }
});

test('server login only grants trust and never initializes or replaces user links', () => {
 const f=fixture({serverGrant:grant()});f.store.delete(CONFIG);f.load();
 assert(f.device().unlocked);assert(!f.store.has(CONFIG));assert(!f.writes.some(([key])=>key===CONFIG));
});
