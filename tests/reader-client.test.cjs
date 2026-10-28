const test=require('node:test'),assert=require('node:assert/strict'),{harness,Evt,root}=require('./fixtures/dom.cjs');
function fixture(){const h=harness();let now=Date.now(),timers=new Map(),intervals=new Map(),id=0,calls=[],handler=async()=>({status:200,ok:true,headers:new Headers({'ETag':'"v1"'}),json:async()=>({version:1,initialized:true,connected:true,stale:false,webhookConfigured:true,items:[]})});
 h.ctx.setTimeout=(f,ms)=>{timers.set(++id,{f,ms});return id};h.ctx.clearTimeout=i=>timers.delete(i);h.ctx.setInterval=(f,ms)=>{intervals.set(++id,{f,ms});return id};h.ctx.clearInterval=i=>intervals.delete(i);h.ctx.Headers=Headers;
 h.ctx.fetch=async(url,options)=>{calls.push({url,options});return handler(url,options)};
 h.run(root+'/src/frontend/reader.js');return {h,calls,timers,intervals,handler:f=>handler=f,async resume(){const list=[...timers].filter(([,t])=>t.ms===80);for(const[i,t]of list){timers.delete(i);t.f()}for(let i=0;i<10;i++)await Promise.resolve()},async settle(){for(let i=0;i<15;i++)await Promise.resolve()}};
}
const response=(data,etag='"v1"')=>({status:200,ok:true,headers:new Headers({'ETag':etag}),json:async()=>data});
const cache=(items=[])=>({version:1,initialized:true,connected:true,stale:false,webhookConfigured:true,items});
test('visible lifecycle merges focus/visibility, conditional version requests, hidden disconnect and reconnect',async()=>{
 const f=fixture();await f.resume();assert.equal(f.calls.length,1);assert.equal(f.intervals.size,1);assert.equal(f.h.doc.getElementById('reader-items').textContent,'收件箱暂无文章');
 f.handler(async()=>({status:304,ok:false,headers:new Headers()}));f.h.ctx.window.dispatchEvent(new Evt('focus'));f.h.doc.dispatchEvent(new Evt('visibilitychange'));await f.resume();assert.equal(f.calls.length,2);assert.equal(f.calls[1].options.headers['If-None-Match'],'"v1"');assert.equal(f.intervals.size,1);
 f.h.doc.hidden=true;f.h.doc.dispatchEvent(new Evt('visibilitychange'));assert.equal(f.intervals.size,0);f.h.ctx.window.dispatchEvent(new Evt('focus'));await f.resume();assert.equal(f.calls.length,2);
 f.h.doc.hidden=false;f.h.doc.dispatchEvent(new Evt('visibilitychange'));await f.resume();assert.equal(f.calls.length,3);assert.equal(f.intervals.size,1);
 f.h.ctx.window.dispatchEvent(new Evt('pagehide'));assert.equal(f.intervals.size,0);f.h.ctx.window.dispatchEvent(new Evt('pageshow'));await f.resume();assert.equal(f.calls.length,4);assert(f.calls.every(x=>x.url.startsWith('/api/reader/')));
});
test('cache error is never empty; old items survive disconnect; titles/date attributes use text, Reader links only',async()=>{
 const f=fixture();f.handler(async()=>{throw Error('offline')});await f.resume();assert.equal(f.h.doc.getElementById('reader-items').textContent,'');assert.equal(f.h.doc.getElementById('reader-status').textContent,'暂时无法加载 Inbox');
 const item={id:'one',title:'<script>untrusted</script>',source:'Example',savedAt:Date.parse('2026-10-07T08:00:00Z'),url:'https://read.readwise.io/read/one'};
 f.handler(async()=>response(cache([item])));f.h.ctx.window.dispatchEvent(new Evt('focus'));await f.resume();const a=f.h.doc.querySelectorAll('.reader-article')[0];assert.equal(a.target,'_blank');assert.equal(a.children[0].title,item.title);assert.equal(a.children[0].textContent,item.title);assert.equal(a.children[1].children[1].dateTime,'2026-10-07T08:00:00.000Z');assert(a.children[1].children[1].title.includes('保存时间'));
 f.handler(async()=>{throw Error()});f.h.ctx.window.dispatchEvent(new Evt('focus'));await f.resume();assert.equal(f.h.doc.querySelectorAll('.reader-article').length,1);assert.equal(f.h.doc.getElementById('reader-status').hidden,true);assert(f.h.doc.getElementById('reader-refresh').title.includes('上次更新未完成'));
 f.handler(async()=>response(cache([{...item,url:'https://evil.example/'}])));f.h.ctx.window.dispatchEvent(new Evt('focus'));await f.resume();assert.equal(f.h.doc.querySelectorAll('.reader-article')[0].href,item.url);
});
test('manual refresh coalesces clicks and has a one-minute cooldown; cache contains no config writes',async()=>{
 const f=fixture();await f.resume();let resolve;
 f.handler(async url=>url.endsWith('/sync')?new Promise(r=>resolve=r):response(cache()));const refresh=f.h.doc.getElementById('reader-refresh');refresh.click();refresh.click();await f.settle();assert.equal(f.calls.filter(c=>c.url.endsWith('/sync')).length,1);assert.equal(refresh.disabled,true);
 resolve(response({status:'updated',retryAfter:60}));await f.settle();assert.equal(refresh.disabled,true);refresh.click();await f.settle();assert.equal(f.calls.filter(c=>c.url.endsWith('/sync')).length,1);assert.equal(f.h.writes.length,0);
});

test('webhook article renders even before initial sync; failed sync preserves it and shows useful token error',async()=>{
 const f=fixture(),item={id:'new',title:'New saved article',source:'Example',savedAt:Date.now(),url:'https://read.readwise.io/read/new'};
 const data={...cache([item]),initialized:false,stale:true};
 f.handler(async url=>url.endsWith('/sync')?{status:503,ok:false,headers:new Headers(),json:async()=>({error:'invalid_token'})}:response(data));
 await f.resume();await f.settle();
 assert.equal(f.h.doc.querySelectorAll('.reader-article').length,1);
 assert.equal(f.h.doc.getElementById('reader-status').hidden,true);assert(f.h.doc.getElementById('reader-refresh').title.includes('Token 无效'));
 assert.equal(f.h.doc.getElementById('reader-setup-link').hidden,false);
 assert(!f.h.doc.getElementById('reader-items').textContent.includes('收件箱暂无文章'));
});

test('compact Reader rows expose full information to keyboard/touch through a modal and restore focus after updates',async()=>{
 const f=fixture(),h=f.h,now=Date.parse('2026-10-12T00:00:00Z');
 h.ctx.Date=class extends Date{static now(){return now}};
 const item={id:'details',title:'<script>完整长标题</script> '+ '课程与文章'.repeat(30),source:'完整来源 '+ '报刊'.repeat(40),savedAt:now-2*3600000,url:'https://read.readwise.io/read/details'};
 f.handler(async()=>response(cache([item])));await f.resume();
 const get=id=>h.doc.getElementById(id), info=h.doc.querySelector('.reader-details-button'), row=h.doc.querySelector('.reader-item'), scroller=row.closest('.module-scroll');
 assert.equal(row.children[0].tag,'a');assert.equal(row.children[1].tag,'button');assert.equal(info.getAttribute('aria-haspopup'),'dialog');
 assert.equal(row.querySelector('time').textContent,'2小时前');assert(row.children[0].getAttribute('aria-label').includes(item.title));
 scroller.scrollTop=90;info.focus();info.click();
 assert.equal(get('reader-details-dialog').open,true);assert.equal(get('reader-details-dialog').closest('.page-shell'),null);
 assert.equal(get('reader-details-title').textContent,item.title);assert.equal(get('reader-details-title').children.length,0);
 assert.equal(get('reader-details-source').textContent,item.source);assert(get('reader-details-time').textContent.includes('北京时间'));
 assert.equal(get('reader-details-open').href,item.url);assert.equal(h.doc.activeElement,get('reader-details-close'));
 assert.equal(f.calls.length,1);assert.equal(f.intervals.size,1);
 // A background metadata refresh may replace rows while the modal remains open.
 f.handler(async()=>({status:304,ok:false,headers:new Headers()}));h.ctx.window.dispatchEvent(new Evt('focus'));await f.resume();
 const refreshed=h.doc.querySelector('.reader-details-button');assert.notEqual(refreshed,info);assert.equal(get('reader-details-dialog').open,true);assert.equal(scroller.scrollTop,90);
 get('reader-details-dialog').dispatchEvent(new Evt('cancel'));assert.equal(get('reader-details-dialog').open,false);assert.equal(h.doc.activeElement,refreshed);
 h.ctx.window.dispatchEvent(new Evt('focus'));await f.resume();assert.equal(h.doc.activeElement,h.doc.querySelector('.reader-details-button'));assert.equal(scroller.scrollTop,90);
 h.doc.querySelector('.reader-details-button').click();h.ctx.window.HomeDevice.unlocked=false;h.ctx.window.dispatchEvent(new Evt('myhome:lock'));
 assert.equal(get('reader-details-dialog').open,false);assert.equal(get('reader-details-title').textContent,'');assert.equal(get('reader-details-source').textContent,'');assert.equal(get('reader-details-open').getAttribute('href'),undefined);assert.equal(f.intervals.size,0);
 assert.equal(h.writes.length,0);
});

test('relative saved time changes on the existing conditional refresh, with one timer and no extra request type',async()=>{
 const f=fixture(),h=f.h;let now=Date.parse('2026-10-12T00:00:00Z');h.ctx.Date=class extends Date{static now(){return now}};
 const item={id:'time',title:'文章',source:'来源',savedAt:now-30*60000,url:'https://read.readwise.io/read/time'};
 f.handler(async()=>response(cache([item])));await f.resume();assert.equal(h.doc.querySelector('.reader-article').querySelector('time').textContent,'30分钟前');
 now+=60*60000;f.handler(async()=>({status:304,ok:false,headers:new Headers()}));h.ctx.window.dispatchEvent(new Evt('focus'));await f.resume();assert.equal(h.doc.querySelectorAll('.reader-article')[0].querySelector('time').textContent,'1小时前');
 now+=48*3600000;h.ctx.window.dispatchEvent(new Evt('focus'));await f.resume();assert(h.doc.querySelectorAll('.reader-article')[0].querySelector('time').textContent.includes('10月12日'));
 assert.equal(f.intervals.size,1);assert.equal(f.calls.length,3);assert(f.calls.every(c=>c.url==='/api/reader/inbox'));assert(h.doc.querySelectorAll('.reader-article')[0].querySelector('time').title.includes('保存时间'));
});
