import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const worker = (await import('data:text/javascript;base64,'+Buffer.from(readFileSync(new URL('../dist/server/index.js',import.meta.url))).toString('base64'))).default;
test('unknown pages and resources return 404 without consulting authentication or the database', async () => {
  const env={DB:{prepare(){throw Error('Unknown resources must not access D1');}}};
  for (const path of ['/missing-page','/missing-page.html','/missing-script.js','/missing-download.zip']) {
    for (const method of ['GET','HEAD','POST']) {
      const r=await worker.fetch(new Request('https://home.example.com'+path,{method}),env,{});
      assert.equal(r.status,404,path);assert.equal(r.headers.get('Location'),null);
    }
  }
});
test('optional demo configuration validates through the real model and leaves new-browser defaults empty', () => {
  const context={URL,crypto:globalThis.crypto};vm.createContext(context);
  vm.runInContext(readFileSync(new URL('../src/frontend/model.js',import.meta.url),'utf8'),context);
  const model=context.HomeModel;
  const demo=JSON.parse(readFileSync(new URL('../examples/demo-config.json',import.meta.url),'utf8'));
  const restored=model.restoreConfig(demo);assert.equal(restored.version,4);assert.equal(restored.semesters[0].courses.length,1);
  const fresh=model.defaultConfig();assert(fresh.modules.every(m=>m.links.length===0));assert(fresh.semesters.every(s=>s.courses.length===0));
});
