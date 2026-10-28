import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {annotateMarkup,localizeMarkup,requestLanguage,translateMessage} from '../src/shared/i18n.mjs';
import {HomeAuth} from '../worker/auth.mjs';
import {database} from './fixtures/database.mjs';

const require=createRequire(import.meta.url),{harness,root}=require('./fixtures/dom.cjs');
function page(language='en') {
  const h=harness();h.ctx.window.navigator.language=language;h.ctx.window.localStorage=h.ctx.localStorage;
  h.ctx.window.location={protocol:'https:'};
  h.run(root+'/dist/i18n.js');return h;
}
test('language preference persists separately and translates only explicitly marked content',()=>{
  const h=page(),i18n=h.ctx.window.HomeI18n;
  const label=h.doc.createElement('span');label.setAttribute('data-i18n','保存');h.doc.body.append(label);
  const user=h.doc.createElement('span');user.textContent='保存';h.doc.body.append(user);
  i18n.apply();assert.equal(label.textContent,'Save');assert.equal(user.textContent,'保存');
  const before=h.store.get('my-home-launchpad.config.v1');i18n.setLanguage('zh-CN');
  assert.equal(label.textContent,'保存');assert.equal(h.store.get('myhome.language.v1'),'zh-CN');
  assert.equal(h.store.get('my-home-launchpad.config.v1'),before);assert(h.doc.cookie.includes('SameSite=Lax'));
  h.run(root+'/dist/i18n.js');assert.equal(h.ctx.window.HomeI18n.language,'zh-CN');
});
test('page controls switch languages while saved names and an open editor draft are preserved',()=>{
  const h=page();for(const name of ['model','icons','ui','interactions','module-layout','app'])h.run(root+'/src/frontend/'+name+'.js');
  assert.equal(h.doc.getElementById('edit-label').textContent,'Organize');
  const before=h.store.get('my-home-launchpad.config.v1');
  assert.equal(h.doc.querySelectorAll('.course-launch')[0].textContent,'示例课程 1');
  h.ctx.window.HomeI18n.setLanguage('zh-CN');assert.equal(h.doc.getElementById('edit-label').textContent,'整理');
  assert.equal(h.store.get('my-home-launchpad.config.v1'),before);
  h.doc.getElementById('edit-button').click();h.doc.querySelectorAll('.course-launch')[0].click();
  const input=h.doc.getElementById('field-name');input.value='Unfinished draft';
  h.ctx.window.HomeI18n.setLanguage('en');assert.equal(input.value,'Unfinished draft');assert.equal(h.doc.getElementById('editor').open,true);
  assert.equal(h.store.get('my-home-launchpad.config.v1'),before);
});
test('HTML translation escapes text and leaves scripts, user code, and the Shortcut identifier intact',()=>{
  const source='<html lang="zh-CN"><title>设置</title><p title="保存">保存</p><textarea>保存</textarea><strong>My Home 打开资料</strong></html>';
  const html=localizeMarkup(annotateMarkup(source),'en');
  assert(html.includes('<html lang="en"'));assert(html.includes('>Settings</title>'));assert(html.includes('title="Save"'));
  assert(html.includes('<textarea>保存</textarea>'));assert(html.includes('<strong>My Home 打开资料</strong>'));
  assert.equal(translateMessage('User-owned text','en'),'User-owned text');
});
test('password pages use the selected language without changing authentication requirements',async()=>{
  const db=database().db,auth=new HomeAuth({DB:db,HOME_SECURITY_KEY:Buffer.alloc(32,11).toString('base64url'),HOME_RECOVERY_KEY:Buffer.alloc(32,12).toString('base64url')});
  const response=await auth.route(new Request('https://home.example.com/login',{headers:{'Accept-Language':'en-US'}}));
  const html=await response.text();assert.equal(response.status,200);assert(html.includes('lang="en"'));assert(html.includes('>Set password · My Home</title>'));
  assert(html.includes('name="recovery"'));assert(html.includes('src="/i18n.js?v='));assert(html.includes('data-home-language'));
  const request=new Request('https://home.example.com/login',{headers:{'Accept-Language':'en','Cookie':'myhome.language.v1=zh-CN'}});
  assert.equal(requestLanguage(request),'zh-CN');assert((await (await auth.route(request)).text()).includes('>设置密码 · My Home</title>'));
});
