import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,existsSync} from 'node:fs';import {database} from './fixtures/database.mjs';import {HomeAuth} from '../worker/auth.mjs';
const worker=(await import('data:text/javascript;base64,'+Buffer.from(readFileSync(new URL('../dist/server/index.js',import.meta.url))).toString('base64'))).default;
const origin='https://my-home.example.com';
test('unknown resources return 404 without login or database access',async()=>{
 const assets=JSON.parse(readFileSync(new URL('../dist/server/index.js',import.meta.url),'utf8').match(/const ASSETS = (\{[^\n]+\});/)[1]);
 for(const path of ['/unlisted-data.json','/unlisted-script.js']){
  assert.equal(existsSync(new URL('../dist'+path,import.meta.url)),false,path);
  assert.equal(Object.hasOwn(assets,path),false,path);
 }
 assert(Object.hasOwn(assets,'/clock.js'));
 const env={DB:database().db,HOME_SECURITY_KEY:Buffer.alloc(32,1).toString('base64url'),HOME_RECOVERY_KEY:Buffer.alloc(32,9).toString('base64url')},auth=new HomeAuth(env);
 const logged=await auth.route(new Request(origin+'/api/auth/password',{method:'POST',headers:{Origin:origin},body:new URLSearchParams({recovery:Buffer.alloc(32,9).toString('base64url'),password:'Resource Test 1234',confirm:'Resource Test 1234'})}));
 const Cookie=logged.headers.get('Set-Cookie').split(';')[0];
 for(const environment of [env,{}, {...env,DB:{prepare(){throw Error('Missing resource must not query the database')}}}]){
  for(const cookie of ['',Cookie])for(const path of ['/unlisted-data.json','/unlisted-data.json?version=test','/unlisted-script.js','/missing-resource.json'])for(const method of ['GET','HEAD','POST']){
   const r=await worker.fetch(new Request(origin+path,{method,headers:{Cookie:cookie}}),environment,{});
   assert.equal(r.status,404,method+' '+path);assert.equal(r.headers.get('Location'),null);
   assert.equal(await r.text(),method==='HEAD'?'':'Not found');
  }
 }
});
test('built Worker preserves active assets and local helper download, rejects unverified events',async()=>{

 const env={DB:database().db,HOME_SECURITY_KEY:Buffer.alloc(32,1).toString('base64url'),HOME_RECOVERY_KEY:Buffer.alloc(32,9).toString('base64url'),READER_WEBHOOK_SECRET:'official-secret'};
 const auth=new HomeAuth(env);const made=await auth.route(new Request(origin+'/api/auth/password',{method:'POST',headers:{Origin:origin},body:new URLSearchParams({recovery:Buffer.alloc(32,9).toString('base64url'),password:'Test Only 1234',confirm:'Test Only 1234'})}));const Cookie=made.headers.get('Set-Cookie').split(';')[0];
 for(const path of ['/','/style.css','/clock.js','/my-home-windows-folders.zip']){const r=await worker.fetch(new Request(origin+path,{headers:{Cookie}}),env,{});assert.equal(r.status,200);assert((await r.arrayBuffer()).byteLength>0)}
 // Shared asset objects must preserve each public URL's content, policy and authentication.
 for(const paths of [['/index.html','/fast.html']]){
  let expected;
  for(const path of paths){
   const r=await worker.fetch(new Request(origin+path,{headers:{Cookie}}),env,{});
   assert.equal(r.status,200);const bytes=Buffer.from(await r.arrayBuffer());
   if(expected)assert.deepEqual(bytes,expected);else expected=bytes;
   assert.equal(r.headers.get('Cache-Control'),'private, no-store');
   const head=await worker.fetch(new Request(origin+path,{method:'HEAD',headers:{Cookie}}),env,{});
   assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal(head.headers.get('Content-Type'),r.headers.get('Content-Type'));
   const denied=await worker.fetch(new Request(origin+path),env,{});assert.equal(denied.status,303);
  }
 }
 const r=await worker.fetch(new Request(origin+'/api/reader/webhook',{method:'POST',body:JSON.stringify({id:'x',secret:'wrong',event_type:'reader.any_document.created'})}),env,{});assert.equal(r.status,401);
 const empty=await worker.fetch(new Request(origin+'/api/reader/webhook',{method:'POST',body:'[]'}),env,{});assert.equal(empty.status,400);
 assert.equal((await worker.fetch(new Request(origin+'/api/reader/inbox'),env,{})).status,401);
 const probe=await worker.fetch(new Request(origin+'/api/reader/webhook',{method:'POST',body:JSON.stringify({secret:'official-secret'})}),env,{});assert.equal(probe.status,200);
});
test('Readwise empty POST endpoint test succeeds without authentication or cache writes; malformed payloads still fail',async()=>{
 const f=database(),env={DB:f.db,HOME_SECURITY_KEY:Buffer.alloc(32,7).toString('base64url')};
 for(const body of [undefined,'']){
  const r=await worker.fetch(new Request(origin+'/api/reader/webhook',{method:'POST',...(body===undefined?{}:{body})}),env,{});
  assert.equal(r.status,200);assert.deepEqual(await r.json(),{test:true});
 }
 for(const body of ['not-json','[]','null',' '])assert.equal((await worker.fetch(new Request(origin+'/api/reader/webhook',{method:'POST',body}),env,{})).status,400);
 assert.equal((await worker.fetch(new Request(origin+'/api/reader/webhook',{method:'POST',body:JSON.stringify({id:'x',event_type:'reader.any_document.created'})}),env,{})).status,401);
});
