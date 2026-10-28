const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {harness,Evt,root}=require('./fixtures/dom.cjs');
test('published minified bundle renders links before Reader, preserves editing and Reader search',()=>{
 const h=harness(),timers=new Map(),marks=[];let timerId=0,requests=0;
 h.ctx.setTimeout=(f,ms)=>{timers.set(++timerId,{f,ms});return timerId};h.ctx.clearTimeout=id=>timers.delete(id);h.ctx.clearInterval=()=>{};
 h.ctx.window.performance={mark:name=>marks.push(name)};
 h.ctx.fetch=()=>{requests++;return new Promise(()=>{})};
 const script=fs.readFileSync(root+'/dist/index.html','utf8').match(/data-home-bundle="(launchpad\.[^\"]+\.js)"/)[1];h.run(root+'/dist/'+script);
 assert.equal(h.doc.querySelectorAll('.course-card').length,7);assert.equal(requests,0);
 assert.deepEqual(marks,['myhome:links-ready','myhome:search-ready']);
 const resume=[...timers.values()].find(t=>t.ms===80);assert(resume);resume.f();assert.equal(requests,1);
 // An unresolved Reader request must not block search or the course editor.
 h.doc.getElementById('search-engine').click();h.doc.querySelectorAll('.engine-option').find(x=>x.dataset.engine==='reader').click();
 h.doc.getElementById('search-query').value='中文 & + #';h.doc.getElementById('home-search').dispatchEvent(new Evt('submit'));
 const url=new URL(h.ctx.window.opened.at(-1)[0]);assert.equal(url.origin,'https://read.readwise.io');assert.equal(url.pathname,'/search');assert.equal(url.searchParams.get('q'),'中文 & + #');
 h.doc.getElementById('edit-button').click();h.doc.querySelectorAll('.course-launch')[0].click();
 h.doc.getElementById('field-name').value='Edited production course';h.doc.getElementById('editor-form').dispatchEvent(new Evt('submit'));
 assert.equal(h.doc.getElementById('editor').open,false);
 const saved=JSON.parse(h.store.get('my-home-launchpad.config.v1'));assert.equal(saved.semesters[0].courses[0].name,'Edited production course');
 assert.equal(saved.semesters[0].courses[0].links.length,3);assert.equal(h.doc.querySelectorAll('.course-card').length,7);
});

test('cold-start HTML has no external render dependencies and uses the same saved configuration',()=>{
 const vm=require('node:vm'),fast=fs.readFileSync(root+'/dist/fast.html','utf8');
 assert(!/<script[^>]*\bsrc=/.test(fast));assert(!/<link[^>]*rel="(?:stylesheet|preload)"/.test(fast));
 const scripts=[...fast.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);assert.equal(scripts.length,3);
 const standard=fs.readFileSync(root+'/dist/index.html','utf8');assert(!standard.includes('src="./theme.js"'));
 assert.equal(fast.match(/<style>([\s\S]*?)<\/style>/)[1],fs.readFileSync(root+'/dist/style.css','utf8'));
 assert(fast.indexOf('<script>')<fast.indexOf('<style>'));assert(fast.indexOf('data-home-bundle=')>fast.indexOf('id="appearance-dialog"'));
 const h=harness(),timers=new Map();let requests=0,id=0;
 h.ctx.setTimeout=(f,ms)=>{timers.set(++id,{f,ms});return id};h.ctx.clearTimeout=i=>timers.delete(i);h.ctx.clearInterval=()=>{};
 h.ctx.fetch=()=>{requests++;return new Promise(()=>{})};
 h.run(root+'/src/frontend/model.js');const config=JSON.parse(JSON.stringify(h.ctx.window.HomeModel.restoreConfig(require("./fixtures/config.json").config)));
 config.semesters[0].courses[0].name='My preserved course';h.store.set('my-home-launchpad.config.v1',JSON.stringify(config));
 h.store.set('myhome.appearance.v1','{"minute":1140}');
 h.store.set('myhome.device.v1',JSON.stringify({version:1,revision:1,expiresAt:Date.now()+86400000}));
 delete h.ctx.window.HomeDevice;
 for(const source of scripts)vm.runInContext(source,h.ctx);
 assert.equal(h.ctx.window.HomeTheme.fixed,1140);assert.equal(h.doc.querySelectorAll('.course-card').length,7);
 assert(h.doc.getElementById('courses').textContent.includes('My preserved course'));assert.equal(requests,0);
 const input=h.doc.getElementById('search-query');input.focus();h.doc.getElementById('home-search').dispatchEvent(new Evt('focusin',{target:input}));
 assert(h.doc.body.className.includes('search-active'));h.doc.dispatchEvent(new Evt('keydown',{key:'Escape',target:input}));
 const resume=[...timers.values()].find(t=>t.ms===80);assert(resume);resume.f();assert.equal(requests,1);
});
