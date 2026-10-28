import test from 'node:test';
import assert from 'node:assert/strict';
import {HomeAuth} from '../worker/auth.mjs';
import {database} from './fixtures/database.mjs';

const origin = 'https://home.example.com', recovery = Buffer.alloc(32, 19).toString('base64url');
const setup = () => { const f = database(); return {...f, auth: new HomeAuth({DB:f.db, HOME_SECURITY_KEY:Buffer.alloc(32, 17).toString('base64url'), HOME_RECOVERY_KEY:recovery})}; };
const post = (path, values, headers = {}) => new Request(origin + path, {method:'POST', headers:{Origin:origin, Accept:'application/json', ...headers}, body:new URLSearchParams(values)});
const values = {password:'Test strong password', confirm:'Test strong password', recovery};
const cookie = r => r.headers.get('Set-Cookie').split(';')[0];

test('forged identity headers and app cookie cannot reset password; recovery is never echoed', async () => {
  const f = setup(), created = await f.auth.route(post('/api/auth/password', values)), Cookie = cookie(created);
  assert.equal(created.status, 200);
  for (const headers of [{'X-Authenticated-User-Email':'owner@example.com'}, {'Cf-Access-Authenticated-User-Email':'owner@example.com'}, {Cookie}]) {
    const r = await f.auth.route(post('/api/auth/password', {...values, recovery:''}, headers));
    assert.equal(r.status, 403); assert.equal(r.headers.get('Set-Cookie'), null);
  }
  assert.equal((await f.auth.profile()).revision, 1);
  const html = await (await f.auth.route(new Request(origin+'/password-reset'))).text();
  assert(!html.includes(recovery)); assert(html.includes('action="/api/auth/password"'));
  f.auth.env.HOME_RECOVERY_KEY = '';
  assert.equal((await f.auth.route(post('/api/auth/password', values))).status, 503);
  assert.equal((await f.auth.route(post('/api/auth/login', {password:values.password}))).status, 200);
});

test('password change requires current password, session and origin; preserves Reader encryption and revokes old sessions', async () => {
  const f = setup(), created = await f.auth.route(post('/api/auth/password', values)), Cookie = cookie(created);
  await f.auth.route(post('/api/reader/settings', {token:'test-reader', secret:'test-hook'}, {Cookie}));
  const encrypted = (await f.auth.profile()).reader_secrets;
  const changed = {password:'New strong password', confirm:'New strong password', current:values.password};
  assert.equal((await f.auth.route(post('/api/auth/change-password', changed))).status, 403);
  assert.equal((await f.auth.route(post('/api/auth/change-password', {...changed,current:'wrong'}, {Cookie}))).status, 403);
  assert.equal((await f.auth.route(post('/api/auth/change-password', changed, {Cookie,Origin:'https://evil.example'}))).status, 403);
  const success = await f.auth.route(post('/api/auth/change-password', changed, {Cookie}));
  assert.equal(success.status, 200);
  const profile = await f.auth.profile();
  assert.equal(profile.reader_secrets, encrypted);
  assert.deepEqual(await f.auth.readerCredentials(profile), {token:'test-reader',secret:'test-hook'});
  assert(!await f.auth.authorized(new Request(origin, {headers:{Cookie}}), profile));
  assert(await f.auth.authorized(new Request(origin, {headers:{Cookie:cookie(success)}}), profile));
  const page = await f.auth.route(new Request(origin+'/password-change', {headers:{Cookie:cookie(success)}}));
  assert((await page.text()).includes('name="current"'));
});

test('recovery guessing is rate limited; simultaneous bootstrap/reset cannot grant a competing revision', async () => {
  const f = setup();
  for(let i=0;i<10;i++) assert.equal((await f.auth.route(post('/api/auth/password', {...values,recovery:''}))).status, 403);
  assert.equal((await f.auth.route(post('/api/auth/password', values))).status, 429);
  const g = setup();
  const concurrent = () => Promise.all([g.auth.route(post('/api/auth/password', values)), g.auth.route(post('/api/auth/password', {...values,password:'Another strong password',confirm:'Another strong password'}))]);
  for(let i=0;i<2;i++) {
    const responses = await concurrent();
    assert.deepEqual(responses.map(r=>r.status).sort(), [200,409]);
    assert.equal(responses.find(r=>r.status===409).headers.get('Set-Cookie'), null);
  }
});
