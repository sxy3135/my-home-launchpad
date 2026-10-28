import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';

test('built Worker uses real workerd/D1 with persistence and existing migrations', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'myhome-d1-test-'));
  const recovery = Buffer.alloc(32, 12).toString('base64url'), origin = 'https://my-home.example.com';
  const options = {modules:true, scriptPath:new URL('../../dist/server/index.js',import.meta.url).pathname, compatibilityDate:'2026-10-12', cf:false,
    d1Databases:{DB:'test-home'}, resourcePersistencePath:directory, bindings:{HOME_SECURITY_KEY:Buffer.alloc(32,11).toString('base64url'), HOME_RECOVERY_KEY:recovery}};
  let mf = new Miniflare(convertV4MiniflareOptions(options));
  const post = (path, data, Cookie='') => mf.dispatchFetch(origin+path, {method:'POST', redirect:'manual', headers:{Origin:origin, Accept:'application/json', Cookie, 'cf-connecting-ip':'127.0.0.1'}, body:new URLSearchParams(data)});
  try {
    const db = await mf.getD1Database('DB');
    for(const name of (await readdir(new URL('../../drizzle/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort()) {
      const sql = await readFile(new URL('../../drizzle/'+name,import.meta.url),'utf8');
      for(const statement of sql.replaceAll('--> statement-breakpoint','').split(';').filter(s=>s.trim())) await db.prepare(statement).run();
    }
    const denied = await post('/api/auth/password', {password:'Runtime Test 1234',confirm:'Runtime Test 1234'});
    assert.equal(denied.status,403);
    const created = await post('/api/auth/password', {password:'Runtime Test 1234',confirm:'Runtime Test 1234',recovery});
    assert.equal(created.status,200); const Cookie=created.headers.get('Set-Cookie').split(';')[0];
    const home = await mf.dispatchFetch(origin, {headers:{Cookie}}); assert.equal(home.status,200);
    assert.equal(home.headers.get('Cache-Control'),'private, no-store');
    const settings = await post('/api/reader/settings',{token:'runtime-test-token',secret:'runtime-hook'},Cookie); assert.equal(settings.status,303);
    const row = await db.prepare("SELECT reader_secrets FROM home_security WHERE id='home'").first(); assert(!row.reader_secrets.includes('runtime-test-token'));
    const inbox = await mf.dispatchFetch(origin+'/api/reader/inbox',{headers:{Cookie}}); assert.equal(inbox.status,200); assert.equal((await inbox.json()).connected,true);
    const hook = await mf.dispatchFetch(origin+'/api/reader/webhook',{method:'POST',body:JSON.stringify({id:'x',event_type:'reader.any_document.created',secret:'wrong'})});assert.equal(hook.status,401);
    assert.equal((await post('/api/auth/change-password',{current:'Runtime Test 1234',password:'Runtime Next 1234',confirm:'Runtime Next 1234'},Cookie)).status,200);
    assert.equal((await mf.dispatchFetch(origin+'/api/auth/session',{headers:{Cookie}})).status,401);
    await mf.dispose(); mf = new Miniflare(convertV4MiniflareOptions(options));
    assert.equal((await post('/api/auth/login',{password:'Runtime Next 1234'})).status,200);
    const persistent = await (await mf.getD1Database('DB')).prepare("SELECT reader_secrets FROM home_security WHERE id='home'").first(); assert.equal(persistent.reader_secrets,row.reader_secrets);
  } finally { await mf.dispose(); await rm(directory,{recursive:true,force:true}); }
});
