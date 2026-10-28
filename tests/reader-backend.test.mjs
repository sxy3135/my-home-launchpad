import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {ReaderStore,ReaderService,documentState,secretMatches} from '../worker/reader.mjs';
const base=Date.parse('2026-10-07T10:00:00Z'),iso=n=>new Date(n).toISOString();
function raw(id,{location='new',saved=base-10000,updated=base-5000,...extra}={}){return {id,title:'Article '+id,location,saved_at:iso(saved),updated_at:iso(updated),last_moved_at:iso(updated),category:'article',parent_id:null,site_name:'',source_url:'https://www.example.com/a',url:'https://read.readwise.io/read/'+id,...extra}}
function fixture(){
 let now=base;const sqlite=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../drizzle',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 const db={
  prepare(sql){return {bind(...values){
   const statement=sqlite.prepare(sql);
   return {first:async()=>statement.get(...values)||null,all:async()=>({results:statement.all(...values)}),run:async()=>({meta:{changes:Number(statement.run(...values).changes)}})};
  }}},
  async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results}catch(e){sqlite.exec('ROLLBACK');throw e}}
 };
 const store=new ReaderStore(db,()=>now);let calls=[],handler=()=>({results:[]});
 const service=new ReaderService(store,'private-token',{now:()=>now,fetcher:async(url,opts)=>{calls.push({url,opts});const result=await handler(new URL(url));if(result instanceof Response)return result;return Response.json(result)}});
 return {store,service,db,sqlite,calls,advance:n=>now+=n,handler:f=>handler=f};
}
test('initial Inbox cache sorts by saved_at, keeps all candidates and excludes children/other locations',async()=>{
 const f=fixture();f.handler(()=>({results:[raw('a',{saved:base-100}),raw('b',{saved:base-200,published_date:'2030-01-01'}),raw('c',{saved:base-300,updated:base-1}),raw('d',{saved:base-400}),raw('note',{parent_id:'a',category:'note'}),raw('feed',{location:'feed'})]}));
 await f.service.sync();const data=await f.service.list();assert.deepEqual(data.items.map(x=>x.id),['a','b','c']);assert.equal((await f.store.items()).length,4);assert.equal(data.items[0].source,'example.com');assert.equal(f.calls.length,1);assert.equal(new URL(f.calls[0].url).searchParams.get('location'),'new');assert.equal(new URL(f.calls[0].url).searchParams.get('withHtmlContent'),'false');assert(!JSON.stringify(await f.store.state()).includes('private-token'));
 const moved={...raw('a',{location:'archive',updated:base+1}),event_type:'reader.document.archived'};f.advance(2);assert((await f.service.notification(moved)).changed);assert.deepEqual((await f.service.list()).items.map(x=>x.id),['b','c','d']);assert.equal(f.calls.length,1);
 const version=(await f.service.list()).version;assert((await f.service.notification(moved)).duplicate);assert.equal((await f.service.list()).version,version);
 assert((await f.service.notification({...raw('a',{updated:base-5000}),event_type:'reader.document.moved_to_inbox'})).ignored);assert.deepEqual((await f.service.list()).items.map(x=>x.id),['b','c','d']);
 f.advance(2);await f.service.notification({...raw('a',{saved:base-100,updated:base+3}),event_type:'reader.document.moved_to_inbox'});assert.deepEqual((await f.service.list()).items.map(x=>x.id),['a','b','c']);
 f.advance(2);await f.service.notification({...raw('a',{location:'later',updated:base+5}),event_type:'reader.document.moved_to_later'});f.advance(2);await f.service.notification({...raw('a',{saved:base-100,updated:base+7}),event_type:'reader.document.moved_to_inbox'});assert.deepEqual((await f.service.list()).items.map(x=>x.id),['a','b','c']);
});
test('finished and ambiguous same-clock events query by ID; reading progress alone never removes',async()=>{
 const f=fixture();await f.store.apply(documentState(raw('a')));f.handler(url=>{assert.equal(url.searchParams.get('id'),'a');assert(!url.searchParams.has('location'));return {results:[raw('a',{updated:base+1,reading_progress:1})]}});f.advance(2);
 await f.service.notification({id:'a',event_type:'reader.document.finished'});assert.equal((await f.store.items()).length,1);
 f.handler(()=>({results:[raw('a',{location:'archive',updated:base+1})]}));await f.service.notification({...raw('a',{location:'later',updated:base+1}),event_type:'reader.document.moved_to_later'});assert.equal((await f.store.items()).length,0);assert.equal(f.calls.length,2);
});
test('failure retains last cache and stale state; empty, fewer than three, source fallback and Reader URL safety',async()=>{
 const f=fixture();f.handler(()=>({results:[raw('one',{source_url:'mailto:reader/a',url:'https://evil.example/x'})]}));await f.service.sync();const one=await f.service.list();assert.equal(one.items.length,1);assert.equal(one.items[0].source,'');assert.equal(one.items[0].url,'https://read.readwise.io/read/one');
 f.handler(()=>new Response(null,{status:500}));await assert.rejects(f.service.notification({id:'one',event_type:'reader.document.finished'}));assert.equal((await f.service.list()).items.length,1);assert.equal((await f.service.list()).stale,true);
 f.advance(60001);await assert.rejects(f.service.sync());assert.equal((await f.store.items()).length,1);
 f.advance(60001);f.handler(()=>({results:[]}));await f.service.sync();const empty=await f.service.list();assert.equal(empty.initialized,true);assert.equal(empty.items.length,0);assert.equal(empty.stale,false);
 await f.service.notification({...raw('one'),event_type:'reader.any_document.created'});assert.equal((await f.store.items()).length,0);
});
test('concurrent syncs merge, manual cooldown and atomic snapshots preserve later webhook changes',async()=>{
 const f=fixture();await f.store.apply(documentState(raw('a')));f.advance(1);
 let resolve;f.handler(()=>new Promise(r=>resolve=r));const first=f.service.sync();while(!resolve)await new Promise(r=>setImmediate(r));assert.equal((await f.service.sync()).status,'busy');assert.equal(f.calls.length,1);
 f.advance(10);await f.service.notification({...raw('a',{location:'archive',updated:base+10}),event_type:'reader.document.archived'});await f.service.notification({...raw('new',{saved:base+10,updated:base+10}),event_type:'reader.any_document.created'});resolve({results:[raw('a')]});await first;
 assert.deepEqual((await f.store.items()).map(i=>i.id),['new']);assert.equal((await f.service.sync()).status,'busy');
 f.advance(60001);const lease=await f.store.lease(),before=await f.store.items(),batch=f.db.batch;f.db.batch=async()=>{throw Error('D1 unavailable')};await assert.rejects(f.store.snapshot(lease.owner,[],base+1000));assert.deepEqual(await f.store.items(),before);f.db.batch=batch;
});
test('large Inbox pagination resumes cursor without re-reading earlier pages; cached list remains while staging',async()=>{
 const f=fixture();let page=0;f.handler(url=>{const actual=Number(url.searchParams.get('pageCursor')||0);assert.equal(actual,page++);return {results:[raw('p'+actual,{saved:base+actual})],nextPageCursor:actual<16?String(actual+1):null}});
 assert.equal((await f.service.sync()).status,'continuing');assert.equal(f.calls.length,16);assert.equal((await f.service.list()).initialized,false);f.advance(60001);assert.equal((await f.service.sync()).status,'updated');assert.equal(f.calls.length,17);assert.deepEqual((await f.service.list()).items.map(i=>i.id),['p16','p15','p14']);assert.equal((await f.store.items()).length,17);
});
test('API budget is durable across instances, unknown hooks ignored, secret check constant digest',async()=>{
 const f=fixture();for(let i=0;i<18;i++)await f.store.reserveApi();await assert.rejects(f.store.reserveApi(),e=>e.code==='rate_limited');f.advance(60001);await f.store.reserveApi();assert((await f.service.notification({id:'a',event_type:'reader.document.deleted'})).ignored);assert.equal(await secretMatches('x','x'),true);assert.equal(await secretMatches('x','y'),false);assert.equal(await secretMatches('',null),false);
});

test('microsecond saved_at ordering and state clocks do not collapse to arbitrary ID order',async()=>{
 const f=fixture();const earlier=raw('z',{saved_at:'2026-10-07T08:00:00.123455Z',updated_at:'2026-10-07T08:00:00.123455Z',last_moved_at:'2026-10-07T08:00:00.123455Z'}),later=raw('a',{saved_at:'2026-10-07T08:00:00.123456Z',updated_at:'2026-10-07T08:00:00.123456Z',last_moved_at:'2026-10-07T08:00:00.123456Z'});
 f.handler(()=>({results:[earlier,later]}));await f.service.sync();assert.deepEqual((await f.service.list()).items.map(i=>i.id),['a','z']);assert(!('savedOrder' in (await f.service.list()).items[0]));assert(documentState(later).stateAt>documentState(earlier).stateAt);
});

test('API handles only trusted redirects and retries one transient failure; durable diagnostics preserve cache',async()=>{
 const f=fixture();let attempts=0;
 f.handler(()=>++attempts===1?new Response(null,{status:503}):{results:[raw('recovered')]});
 await f.service.sync();assert.equal(attempts,2);assert.equal((await f.service.list()).lastError,null);
 f.advance(60001);f.handler(()=>new Response(null,{status:400}));
 await assert.rejects(f.service.sync(),/reader_http_400/);assert.equal((await f.service.list()).lastError.code,'reader_http_400');assert.equal((await f.service.list()).items[0].id,'recovered');
 f.advance(60001);let redirects=0;f.handler(()=>++redirects===1?new Response(null,{status:302,headers:{Location:'/api/v3/list/?location=new'}}):{results:[raw('redirected')]});
 await f.service.sync();assert.equal((await f.service.list()).lastError,null);assert.equal((await f.service.list()).items[0].id,'redirected');
 f.advance(60001);const before=f.calls.length;f.handler(()=>new Response(null,{status:302,headers:{Location:'https://evil.example/api/'}}));
 await assert.rejects(f.service.sync(),/reader_redirect_invalid/);assert.equal(f.calls.length,before+1);assert(!JSON.stringify(await f.store.state()).includes('private-token'));
 f.advance(60001);f.handler(()=>{throw new TypeError('network private-token https://readwise.io/api/v3/list/')});const start=f.calls.length;
 await assert.rejects(f.service.sync(),/reader_network_error/);assert.equal(f.calls.length,start+2);assert.equal((await f.service.list()).lastError.code,'reader_network_error');assert(!JSON.stringify(await f.store.state()).includes('private-token'));assert(!(await f.service.list()).lastError.transport);
});

test('runtime fetch keeps global receiver instead of ReaderService this (Cloudflare Illegal invocation regression)',async()=>{
 const f=fixture();let requests=0;
 function runtimeFetch(url,options){
  if(this!==globalThis)throw new TypeError('Illegal invocation: function called with incorrect this reference');
  requests++;assert.equal(new URL(url).searchParams.get('location'),'new');assert.equal(options.headers.Authorization,'Token private-token');
  return Promise.resolve(Response.json({results:[raw('real-fetch')]}));
 }
 const service=new ReaderService(f.store,'private-token',{fetcher:runtimeFetch,now:()=>base});
 await service.sync();assert.equal(requests,1);assert.equal((await service.list()).initialized,true);assert.equal((await service.list()).items[0].id,'real-fetch');
});
