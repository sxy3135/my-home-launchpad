const test=require('node:test'),assert=require('node:assert/strict');
const {harness,Evt,root}=require('./fixtures/dom.cjs');
function fixture(stored){
 const h=harness();if(stored)h.store.set('myhome.search-engine',stored);
 h.run(root+'/src/frontend/search.js');
 const get=id=>h.doc.getElementById(id),form=get('home-search'),input=get('search-query'),trigger=get('search-engine'),menu=get('search-engine-options'),options=menu.querySelectorAll('.engine-option');
 const focus=node=>{node.focus();node.dispatchEvent(new Evt('focus'));form.dispatchEvent(new Evt('focusin',{target:node}));h.doc.dispatchEvent(new Evt('focusin',{target:node}))};
 const key=(key,props={})=>h.doc.dispatchEvent(new Evt('keydown',{key,...props}));
 return {...h,get,form,input,trigger,menu,options,focus,key,active:()=>h.doc.body.className.includes('search-active')};
}
test('engine memory, Chinese and special characters, empty/IME submission, no external requests',()=>{
 const f=fixture('bing');assert.equal(f.get('search-engine-name').textContent,'Bing');
 let requests=0;f.ctx.fetch=()=>requests++;
 const query='中文 & + # / ? = 100% 😀';
 for(const [engine,host,param]of [['google','www.google.com','q'],['bing','www.bing.com','q'],['baidu','www.baidu.com','wd'],['reader','read.readwise.io','q']]){
  f.trigger.click();f.options.find(x=>x.dataset.engine===engine).click();assert.equal(f.store.get('myhome.search-engine'),engine);
  f.input.value=' '+query+' ';f.form.dispatchEvent(new Evt('submit'));
  const [href,target]=f.ctx.window.opened.at(-1),url=new URL(href);assert.equal(url.host,host);assert.equal(url.searchParams.get(param),query);assert.equal(target,'_blank');assert.equal(f.active(),false);assert.equal(f.input.value,' '+query+' ');
 }
 const count=f.ctx.window.opened.length;f.input.value='  ';f.form.dispatchEvent(new Evt('submit'));assert.equal(f.ctx.window.opened.length,count);
 f.input.value='拼音';f.input.dispatchEvent(new Evt('compositionstart'));const ime=new Evt('keydown',{key:'Enter',isComposing:true});f.input.dispatchEvent(ime);assert(ime.defaultPrevented);f.form.dispatchEvent(new Evt('submit'));assert.equal(f.ctx.window.opened.length,count);f.input.dispatchEvent(new Evt('compositionend'));assert.equal(requests,0);
 assert.equal(fixture('reader').get('search-engine-name').textContent,'Reader');
 assert.equal(fixture('__proto__').get('search-engine-name').textContent,'Google');
});
test('blank area focuses input; menu retains focus; Tab trap, arrows, Escape and outside click isolation',()=>{
 const f=fixture();f.form.click();assert.equal(f.doc.activeElement,f.input);f.focus(f.input);assert.equal(f.active(),true);
 const bg=f.doc.querySelectorAll('.search-background');assert(bg.every(x=>x.inert));
 f.trigger.click();assert.equal(f.menu.hidden,false);assert.equal(f.doc.activeElement,f.options[0]);
 f.menu.dispatchEvent(new Evt('keydown',{key:'ArrowDown'}));assert.equal(f.doc.activeElement,f.options[1]);
 f.menu.dispatchEvent(new Evt('keydown',{key:'Enter'}));assert.equal(f.get('search-engine-name').textContent,'Bing');assert(f.active());assert.equal(f.doc.activeElement,f.trigger);f.trigger.click();
 f.key('Tab',{shiftKey:true});assert.equal(f.doc.activeElement,f.trigger);assert.equal(f.menu.hidden,true);assert(f.active());
 f.key('Tab');assert.equal(f.doc.activeElement,f.input);assert(f.active());f.key('Tab',{shiftKey:true});assert.equal(f.doc.activeElement,f.trigger);
 f.input.value='保留关键词';f.key('Escape');assert(!f.active());assert.equal(f.menu.hidden,true);assert.equal(f.input.value,'保留关键词');assert(bg.every(x=>!x.inert));
 f.focus(f.input);const click=new Evt('click',{target:f.get('search-scrim')});f.doc.dispatchEvent(click);assert(click.defaultPrevented&&click.stopped);assert(!f.active());assert.equal(f.input.value,'保留关键词');
 f.focus(f.input);const backgroundClick=new Evt('click',{target:f.get('add-course')});f.doc.dispatchEvent(backgroundClick);let opened=0;if(!backgroundClick.stopped)opened++;assert.equal(opened,0);assert(!f.active());
});
test('focused lift survives pointer leave and menu transitions; repeated exits restore original background state',()=>{
 const f=fixture(),bg=f.doc.querySelectorAll('.search-background');
 bg[0].inert=true;bg[0].setAttribute('aria-hidden','false');
 bg[1].inert=false;bg[1].setAttribute('aria-hidden','true');
 const original=bg.map(x=>({inert:x.inert,aria:x.getAttribute('aria-hidden')}));
 for(let cycle=0;cycle<3;cycle++){
  f.focus(f.input);f.focus(f.trigger);f.trigger.click();assert(f.active());
  f.form.dispatchEvent(new Evt('pointerleave'));f.input.dispatchEvent(new Evt('blur'));assert(f.active());assert(bg.every(x=>x.inert));
  f.options[3].click();assert(f.active());assert(f.menu.hidden);f.focus(f.input);assert(f.active());
  f.trigger.click();f.key('Tab');assert(f.active());assert(f.menu.hidden);
  f.input.value='';f.form.dispatchEvent(new Evt('submit'));assert(f.active());
  f.input.value='保留';f.key('Escape');assert(!f.active());assert.equal(f.input.value,'保留');
  const repeated=f.key('Escape');assert(!repeated.defaultPrevented);
  bg.forEach((x,i)=>{assert.equal(x.inert,original[i].inert);assert.equal(x.getAttribute('aria-hidden'),original[i].aria)});
 }
 f.focus(f.input);f.trigger.click();f.ctx.window.dispatchEvent(new Evt('pagehide'));assert(!f.active());assert(f.menu.hidden);assert.equal(f.input.value,'保留');
});
