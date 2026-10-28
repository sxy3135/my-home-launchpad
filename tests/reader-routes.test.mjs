import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {database} from './fixtures/database.mjs';
const worker=(await import('data:text/javascript;base64,'+Buffer.from(readFileSync(new URL('../dist/server/index.js',import.meta.url))).toString('base64'))).default;
const origin='https://my-home.example.com';
test('unknown pages and assets return 404 without authentication or database access',async()=>{
 const env={DB:{prepare(){throw Error('Unknown resources must not query D1')}}};
 for(const path of ['/missing-page','/missing-page.html','/missing-script.js','/missing-data.json?v=1','/missing-download.zip']){
  for(const method of ['GET','HEAD','POST'])for(const Cookie of ['', 'home_session=unverified']){
   const response=await worker.fetch(new Request(origin+path,{method,headers:{Cookie}}),env,{});
   assert.equal(response.status,404,method+' '+path);assert.equal(response.headers.get('Location'),null);
   assert.equal(await response.text(),method==='HEAD'?'':'Not found');
  }
 }
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
