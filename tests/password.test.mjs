import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {HomeAuth} from '../worker/auth.mjs';import {database} from './fixtures/database.mjs';
const origin='https://my-home.example.com',key=Buffer.alloc(32,7).toString('base64url'),owner='owner@example.com',recovery=Buffer.alloc(32,9).toString('base64url');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(readFileSync(new URL('../dist/server/index.js',import.meta.url))).toString('base64'))).default;
const setup=()=>{const f=database(),env={DB:f.db,HOME_SECURITY_KEY:key,HOME_RECOVERY_KEY:recovery};return {...f,env,auth:new HomeAuth(env)}};
const post=(path,values,headers={})=>new Request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded',...headers},body:new URLSearchParams(values)});
const passwordRequest=(values,headers={})=>post('/api/auth/password',{...values,recovery},headers);
const asCookie=response=>response.headers.get('Set-Cookie').split(';')[0];
test('only recovery key bootstraps/reset; hashed server password, persistent signed cookie and expiry/revocation',async()=>{
 const f=setup(),password='Only Test 1234!';
 assert.equal((await f.auth.route(post('/api/auth/password',{password,confirm:password}))).status,303);
 const created=await f.auth.route(passwordRequest({password,confirm:password}));assert.equal(created.status,303);const cookie=asCookie(created),profile=await f.auth.profile();assert(!profile.password_hash.includes(password));assert(created.headers.get('Set-Cookie').includes('HttpOnly'));assert(created.headers.get('Set-Cookie').includes('Secure'));assert(created.headers.get('Set-Cookie').includes('Max-Age=31536000'));
 assert(await f.auth.authorized(new Request(origin,{headers:{Cookie:cookie}}),profile));assert(!await f.auth.authorized(new Request(origin,{headers:{Cookie:cookie+'x'}}),profile));
 const future=new HomeAuth(f.env,()=>Date.now()+366*86400000);assert(!await future.authorized(new Request(origin,{headers:{Cookie:cookie}}),profile));
 assert.equal((await f.auth.route(post('/api/auth/login',{password:'wrong'}))).headers.get('Location'),'/login?error=wrong');
 const logged=await f.auth.route(post('/api/auth/login',{password}));assert.equal(logged.headers.get('Location'),'/');
 await f.auth.route(passwordRequest({password:'New Test Password',confirm:'New Test Password'}));assert(!await f.auth.authorized(new Request(origin,{headers:{Cookie:cookie}}),await f.auth.profile()));
 assert.equal((await f.auth.route(post('/api/auth/logout',{}))).headers.get('Set-Cookie').includes('Max-Age=0'),true);
});
test('every private route/asset requires cookie; service credential or owner identity cannot bypass password',async()=>{
 const f=setup();for(const path of ['/','/index.html','/fast','/fast.html','/my-home-windows-folders.zip','/'+readFileSync(new URL('../dist/index.html',import.meta.url),'utf8').match(/data-home-bundle="([^"]+)"/)[1],'/api/reader/inbox','/api/reader/sync']){const r=await worker.fetch(new Request(origin+path,{headers:{'Authorization':'Bearer test-token','X-Authenticated-User-Email':owner}}),f.env,{});assert([303,401].includes(r.status),path);assert(!(await r.text()).includes('示例课程 1'))}
 const first=await worker.fetch(new Request(origin+'/login'),f.env,{}),loginHtml=await first.text();assert(loginHtml.includes('恢复密钥'));assert(loginHtml.includes('action="/api/auth/password"'));
 assert(loginHtml.indexOf('src="/theme.js"')<loginHtml.indexOf('href="/style.css'));
 assert(first.headers.get('Content-Security-Policy').includes("script-src 'self'"));
 for(const path of ['/style.css','/theme.js','/clock.js']){
  const asset=await worker.fetch(new Request(origin+path),f.env,{});assert.equal(asset.status,200,path);const text=await asset.text();assert(!text.includes('示例课程 1'));assert(!text.includes('private-reader-token'));
 }
 const configured=await f.auth.route(passwordRequest({password:'Test Only 1234',confirm:'Test Only 1234'}));const headers={Cookie:asCookie(configured)};
 const home=await worker.fetch(new Request(origin,{headers}),f.env,{});assert.equal(home.status,200);assert((await home.text()).includes('Reader'));assert.equal(home.headers.get('Cache-Control'),'private, no-store');
 const download=await worker.fetch(new Request(origin+'/my-home-windows-folders.zip',{headers}),f.env,{});
 assert.equal(download.status,200);assert.equal(Buffer.from(await download.arrayBuffer()).subarray(0,2).toString(),'PK');
 const api=await worker.fetch(new Request(origin+'/api/reader/inbox',{headers}),f.env,{});assert.equal(api.status,200);assert.equal((await api.json()).connected,false);
});
test('reader secrets encrypted at rest, never echoed, persist without redeploy; CSRF and brute-force throttling',async()=>{
 const f=setup(),created=await f.auth.route(passwordRequest({password:'Test Only 1234',confirm:'Test Only 1234'})),Cookie=asCookie(created);
 const saved=await f.auth.route(post('/api/reader/settings',{token:'private-reader-token',secret:'official-webhook-secret'},{Cookie}));assert.equal(saved.status,303);const profile=await f.auth.profile();assert(!profile.reader_secrets.includes('private-reader-token'));assert.deepEqual(await f.auth.readerCredentials(profile),{token:'private-reader-token',secret:'official-webhook-secret'});
 const page=await f.auth.route(new Request(origin+'/reader-setup.html',{headers:{Cookie}}));const html=await page.text();assert(!html.includes('private-reader-token'));assert(!html.includes('official-webhook-secret'));assert(html.includes(origin+'/api/reader/webhook'));
 assert.equal((await f.auth.route(post('/api/reader/settings',{token:'changed'},{Cookie,Origin:'https://evil.example'}))).status,403);
 for(let i=0;i<10;i++)await f.auth.route(post('/api/auth/login',{password:'bad'}));assert.equal((await f.auth.route(post('/api/auth/login',{password:'Test Only 1234'}))).headers.get('Location'),'/login?error=rate');
 const hook=await worker.fetch(new Request(origin+'/api/reader/webhook',{method:'POST',body:JSON.stringify({secret:'official-webhook-secret'})}),f.env,{});assert.equal(hook.status,200);
 const forged=await worker.fetch(new Request(origin+'/api/reader/webhook',{method:'POST',body:JSON.stringify({id:'x',event_type:'reader.any_document.created',secret:'wrong'})}),f.env,{});assert.equal(forged.status,401);
});

test('native form pages preserve same-origin POST identity and still reject opaque/cross-site origins',async()=>{
 const f=setup();
 const first=await f.auth.route(new Request(origin+'/login'));
 assert.equal(first.headers.get('Referrer-Policy'),'same-origin');
 const html=await first.text();assert(html.includes('name="referrer" content="same-origin"'));assert(!html.includes('content="no-referrer"'));
 const values={password:'Test Only 1234',confirm:'Test Only 1234'},headers={};
 for(const Origin of ['null','https://evil.example',''])assert.equal((await f.auth.route(passwordRequest(values,{...headers,Origin}))).status,403);
 const created=await f.auth.route(passwordRequest(values,headers));assert.equal(created.status,303);
 const Cookie=asCookie(created);
 for(const path of ['/login','/password-reset','/reader-setup.html']){
  const r=await f.auth.route(new Request(origin+path,{headers:{...headers,...(path==='/reader-setup.html'?{Cookie}:{})}}));
  assert.equal(r.headers.get('Referrer-Policy'),'same-origin',path);
 }
 const home=await worker.fetch(new Request(origin,{headers:{Cookie}}),f.env,{});assert.equal(home.headers.get('Referrer-Policy'),'same-origin');
 const logout=await f.auth.route(post('/api/auth/logout',{}, {Cookie}));assert.equal(logout.status,303);
});

test('versioned assets cache privately, validators still verify revoked sessions, HTML never caches',async()=>{
 const f=setup(),created=await f.auth.route(passwordRequest({password:'Test Only 1234',confirm:'Test Only 1234'})),Cookie=asCookie(created);
 const home=await worker.fetch(new Request(origin,{headers:{Cookie}}),f.env,{}),html=await home.text();
 const script=html.match(/data-home-bundle="(launchpad\.[^\"]+\.js)"/)[1],cssVersion=(await import('node:crypto')).createHash('sha256').update(readFileSync(new URL('../dist/style.css',import.meta.url))).digest('hex').slice(0,12),css='style.css?v='+cssVersion;
 for(const path of ['/index.html','/fast','/fast.html'])assert.equal(await (await worker.fetch(new Request(origin+path,{headers:{Cookie}}),f.env,{})).text(),html);
 assert.equal(home.headers.get('Cache-Control'),'private, no-store');assert.equal(home.headers.get('ETag'),null);
 const asset=await worker.fetch(new Request(origin+'/'+script,{headers:{Cookie}}),f.env,{}),etag=asset.headers.get('ETag'),bytes=await asset.arrayBuffer();
 assert.equal(asset.headers.get('Cache-Control'),'private, max-age=31536000, immutable');assert(etag);assert(bytes.byteLength>0);
 const headers={Cookie,'If-None-Match':etag};
 const unchanged=await worker.fetch(new Request(origin+'/'+script,{headers}),f.env,{});assert.equal(unchanged.status,304);assert.equal(await unchanged.text(),'');
 const weak=await worker.fetch(new Request(origin+'/'+script,{headers:{Cookie,'If-None-Match':'"different", W/'+etag}}),f.env,{});assert.equal(weak.status,304);
 const head=await worker.fetch(new Request(origin+'/'+script,{method:'HEAD',headers:{Cookie}}),f.env,{});assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal(head.headers.get('ETag'),etag);
 const cssResponse=await worker.fetch(new Request(origin+'/'+css),f.env,{});assert.equal(cssResponse.headers.get('Cache-Control'),'public, max-age=31536000, immutable');
 assert.equal((await worker.fetch(new Request(origin+'/style.css?v=old'),f.env,{})).headers.get('Cache-Control'),'public, max-age=300');
 const again=await worker.fetch(new Request(origin+'/'+script,{headers:{Cookie}}),f.env,{});assert.deepEqual(new Uint8Array(await again.arrayBuffer()),new Uint8Array(bytes));
 await f.auth.route(passwordRequest({password:'Changed Test 1234',confirm:'Changed Test 1234'}));
 for(const path of ['/fast','/fast.html'])assert.equal((await worker.fetch(new Request(origin+path,{headers:{Cookie}}),f.env,{})).status,303);
 for(const CookieValue of [Cookie,'']){
  const denied=await worker.fetch(new Request(origin+'/'+script,{headers:{Cookie:CookieValue,'If-None-Match':etag}}),f.env,{});
  assert.equal(denied.status,303);assert.equal(denied.headers.get('Cache-Control'),'private, no-store');
 }
});

test('only authenticated server login grants device trust; session check never leaks seeds/secrets',async()=>{
 const f=setup(),password='Device Test 1234';await f.auth.route(passwordRequest({password,confirm:password}));
 const failed=await worker.fetch(post('/api/auth/login',{password:'wrong'},{Accept:'application/json'}),f.env,{});assert.equal(failed.status,401);assert.equal(failed.headers.get('Set-Cookie'),null);assert.equal((await failed.json()).authenticated,false);
 const login=await worker.fetch(post('/api/auth/login',{password},{Accept:'application/json'}),f.env,{}),grant=await login.json(),Cookie=asCookie(login);
 assert.equal(login.status,200);assert.equal(login.headers.get('Cache-Control'),'private, no-store');assert(grant.authenticated);assert.equal(grant.seed,undefined);
 assert(grant.expiresAt>Date.now()+364*86400000);assert(!JSON.stringify(grant).includes('password_hash'));assert(!JSON.stringify(grant).includes('reader_secrets'));assert(!JSON.stringify(grant).includes(password));
 const session=await worker.fetch(new Request(origin+'/api/auth/session',{headers:{Cookie}}),f.env,{});assert.equal(session.status,200);const data=await session.json();assert.equal(data.expiresAt,grant.expiresAt);assert.equal(data.revision,grant.revision);assert.equal(data.seed,undefined);
 const blocked=await worker.fetch(new Request(origin+'/api/auth/session',{headers:{'X-Device-Trusted':'true'}}),f.env,{});assert.equal(blocked.status,401);
 await f.auth.route(passwordRequest({password:'Changed Device 1234',confirm:'Changed Device 1234'}));
 assert.equal((await worker.fetch(new Request(origin+'/api/auth/session',{headers:{Cookie}}),f.env,{})).status,401);
 const outage=await worker.fetch(new Request(origin+'/api/auth/session',{headers:{Cookie}}),{...f.env,DB:{prepare(){throw Error('offline DB')}}},{});assert.equal(outage.status,503);assert.equal((await outage.json()).authenticated,undefined);
 const logout=await worker.fetch(post('/api/auth/logout',{}, {Accept:'application/json'}),{},{});assert.equal(logout.status,200);assert.equal((await logout.json()).loggedOut,true);assert(logout.headers.get('Set-Cookie').includes('Max-Age=0'));
});

test('public precache program has zero private seed data and sensitive responses remain uncached',async()=>{
 const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'),sw=readFileSync(new URL('../dist/sw.js',import.meta.url),'utf8'),path=sw.match(/PROGRAM="([^"]+)"/)[1];
 const f=setup(),r=await worker.fetch(new Request(origin+path),f.env,{});assert.equal(r.status,200);assert(r.headers.get('Cache-Control').includes('immutable'));assert(r.headers.get('X-MyHome-Program'));assert.equal(await r.text(),html);
 for(const text of ['HomePrivateSeed','home-server-grant" type='])assert(!html.includes(text),text);
 const script=html.match(/data-home-bundle="([^"]+)"/)[1];const js=readFileSync(new URL('../dist/'+script,import.meta.url),'utf8');assert(!js.includes('HomePrivateSeed'));
 const scriptResponse=await worker.fetch(new Request(origin+'/sw.js'),f.env,{});assert.equal(scriptResponse.status,200);assert(scriptResponse.headers.get('Cache-Control').includes('must-revalidate'));assert.equal(scriptResponse.headers.get('Service-Worker-Allowed'),'/');
 for(const url of ['/api/auth/session','/reader-setup.html','/api/reader/settings','/api/reader/inbox']){const response=await worker.fetch(new Request(origin+url),f.env,{});assert([303,401,404].includes(response.status),url);assert.equal(response.headers.get('Cache-Control'),'private, no-store')}
});

test('JSON password setup/reset requires recovery verification and returns the new authenticated revision only after success',async()=>{
 const f=setup(),values={password:'JSON setup test 1234',confirm:'JSON setup test 1234'},headers={Accept:'application/json'};
 assert.equal((await f.auth.route(post('/api/auth/password',values,{Accept:'application/json'}))).status,403);
 const invalid=await f.auth.route(passwordRequest({...values,confirm:'different'},headers));assert.equal(invalid.status,400);assert.equal((await invalid.json()).authenticated,undefined);
 const created=await f.auth.route(passwordRequest(values,headers));assert.equal(created.status,200);const grant=await created.json();assert.equal(grant.authenticated,true);assert.equal(grant.seed,undefined);assert(!JSON.stringify(grant).includes(values.password));
 const Cookie=asCookie(created);assert(await f.auth.authorized(new Request(origin,{headers:{Cookie}}),await f.auth.profile()));
 const reset=await f.auth.route(passwordRequest({password:'JSON reset test 5678',confirm:'JSON reset test 5678'},headers));assert.equal(reset.status,200);assert((await reset.json()).revision>grant.revision);assert(!await f.auth.authorized(new Request(origin,{headers:{Cookie}}),await f.auth.profile()));
});
