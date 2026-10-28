const test=require('node:test'),assert=require('node:assert/strict');
const {harness,Evt,root}=require('./fixtures/dom.cjs');
const {moduleAction,chooseEntry}=require('./fixtures/editor-actions.cjs');
const KEY='my-home-launchpad.config.v1';
const clone=x=>JSON.parse(JSON.stringify(x));
const settle=async()=>{for(let i=0;i<20;i++)await Promise.resolve()};
function fixture(){const h=harness();for(const f of ['icons','model','ui','interactions','module-layout','app'])h.run(root+'/src/frontend/'+f+'.js');h.get=id=>h.doc.getElementById(id);h.config=()=>JSON.parse(h.store.get(KEY)||JSON.stringify(h.ctx.window.HomeModel.restoreConfig(require("./fixtures/config.json").config)));return h}
const submit=h=>h.get('editor-form').dispatchEvent(new Evt('submit'));
const labelled=(h,label)=>h.get('editor-fields').querySelectorAll('button').find(b=>b.getAttribute('aria-label')===label);
function geometry(h){const grid=h.get('module-grid');grid.rect={left:0,right:900,top:0,bottom:1000,width:900,height:1000};grid.children.forEach((p,i)=>p.rect={left:0,right:900,top:i*180,bottom:i*180+160,width:900,height:160});return grid}
function down(h,target,props={}){h.get('module-panel-learning').dispatchEvent(new Evt('pointerdown',{target,button:0,isPrimary:true,pointerId:7,clientX:10,clientY:10,...props}))}
const move=h=>h.doc.dispatchEvent(new Evt('pointermove',{pointerId:7,clientX:100,clientY:890}));
test('one editing state replaces all home handles and control rows; object clicks edit without launch; Finish is guarded',()=>{
 const h=fixture();const writes=h.writes.length;h.get('edit-button').click();assert.equal(h.writes.length,writes);
 assert.equal(h.doc.querySelector('.sort-handle'),undefined);assert.equal(h.doc.querySelector('.editing-controls'),undefined);
 h.doc.querySelector('.entry-link').click();assert.equal(h.get('dialog-title').textContent,'编辑入口');h.get('finish-editing').click();assert(h.doc.body.classList.contains('editing'));
 h.get('cancel-dialog').click();h.doc.querySelector('.course-launch').click();assert.equal(h.get('dialog-title').textContent,'编辑课程');h.get('cancel-dialog').click();
 h.doc.querySelector('.course-link').click();assert.equal(h.get('dialog-title').textContent,'编辑课程');assert(h.get('field-entry-name'));assert.equal(h.ctx.window.opened,undefined);
 h.get('cancel-dialog').click();h.get('finish-editing').click();assert(!h.doc.body.classList.contains('editing'));assert.equal(h.writes.length,writes);
});
test('course entry changes, additions, deletion and sorting stay in one draft; dirty cancel discards all',async()=>{
 const h=fixture();h.get('edit-button').click();const before=h.config();h.doc.querySelector('.course-launch').click();
 h.get('field-entry-name').value='Edited draft';chooseEntry(h,1);assert.equal(h.writes.length,0);
 labelled(h,'添加课程入口').click();h.get('field-entry-name').value='额外网站';h.get('field-url').value='https://example.com/extra';chooseEntry(h,0);
 labelled(h,'下移入口').click();labelled(h,'从课程草稿删除入口').click();assert.deepEqual(h.config(),before);
 h.get('cancel-dialog').click();assert(h.get('editor').open);assert.equal(h.get('confirm-dialog').open,false);
 h.get('editor-confirm-cancel').click();await settle();assert(h.get('editor').open);
 h.get('cancel-dialog').click();h.get('editor-confirm-yes').click();await settle();assert(!h.get('editor').open);assert.deepEqual(h.config(),before);
});
test('one course save validates and atomically commits all entries, target metadata and course position; cancel selection alone is clean',()=>{
 const h=fixture();h.get('edit-button').click();const before=h.config(), first=before.semesters[0].courses[0];h.doc.querySelector('.course-launch').click();chooseEntry(h,2);
 assert.equal(h.get('field-url-windows').value,first.links[2].folderPaths.windows);h.get('cancel-dialog').click();assert(!h.get('editor').open);assert.equal(h.writes.length,0);
 h.doc.querySelector('.course-launch').click();chooseEntry(h,2);h.get('field-url-mac').value='/Users/中文/A & #100%';h.get('field-entry-name').value='资料共用名称';
 labelled(h,'添加课程入口').click();h.get('field-entry-name').value='保留额外入口';h.get('field-url').value='https://example.com/new';h.get('field-position').value='6';submit(h);
 assert(!h.get('editor').open);assert.equal(h.writes.length,1);const saved=h.config().semesters[0].courses.at(-1);assert.equal(saved.id,first.id);assert.equal(saved.links.length,4);
 assert.equal(saved.links[2].folderPaths.mac,'/Users/中文/A & #100%');assert.equal(saved.links[2].folderPaths.windows,first.links[2].folderPaths.windows);assert.equal(saved.links[2].launchRole,'folder');assert.equal(saved.links[3].launchRole,'none');
 assert.deepEqual(h.config().modules,before.modules);
});
test('invalid targets and storage failures retain input and draft, with no formal partial write',()=>{
 const h=fixture();h.get('edit-button').click();const before=h.config();h.doc.querySelector('.course-launch').click();h.get('field-url').value='javascript:bad';submit(h);
 assert(h.get('editor').open);assert(h.get('form-error').textContent);assert.deepEqual(h.config(),before);
 h.get('field-url').value='obsidian://open?vault=V&file=Note';h.get('field-name').value='New course name';h.ctx.localStorage.setItem=()=>{throw Error('storage unavailable')};submit(h);
 assert(h.get('editor').open);assert.equal(h.get('field-name').value,'New course name');assert.equal(h.get('field-url').value,'obsidian://open?vault=V&file=Note');assert(h.get('form-error').textContent.includes('storage'));assert.deepEqual(h.config(),before);
});
test('another tab prevents draft overwrite; discarding loads latest configuration without touching independent settings',async()=>{
 const h=fixture();h.store.set('myhome.search-engine','bing');h.get('edit-button').click();h.doc.querySelector('.course-launch').click();h.get('field-name').value='My draft';
 const next=h.config();next.semesters[0].courses[0].name='Other tab';h.store.set(KEY,JSON.stringify(next));h.ctx.window.dispatchEvent(new Evt('storage',{key:KEY,newValue:JSON.stringify(next)}));submit(h);
 assert(h.get('editor').open);assert.equal(h.get('field-name').value,'My draft');assert(h.get('form-error').textContent.includes('标签页'));assert.equal(h.config().semesters[0].courses[0].name,'Other tab');
 h.get('cancel-dialog').click();h.get('editor-confirm-yes').click();await settle();assert(h.get('courses').textContent.includes('Other tab'));assert.equal(h.store.get('myhome.search-engine'),'bing');
});
test('blank drag threshold, span placeholder, page auto-scroll and every cancellation clean up without saves',()=>{
 for(const cancel of ['Escape','blur','hidden','pointercancel','lostpointercapture','resize']){
  const h=fixture();h.get('edit-button').click();const grid=geometry(h), panel=h.get('module-panel-learning');down(h,panel);h.doc.dispatchEvent(new Evt('pointermove',{pointerId:7,clientX:14,clientY:12}));assert.equal(h.doc.querySelector('.module-placeholder'),undefined);
  move(h);assert(h.doc.querySelector('.module-placeholder'));assert.equal(h.doc.querySelector('.module-placeholder').style['--module-height-units'],'4');assert(h.ctx.window.scroll>0);h.get('finish-editing').click();assert(h.doc.body.classList.contains('editing'));
  if(cancel==='Escape')h.doc.dispatchEvent(new Evt('keydown',{key:'Escape'}));else if(cancel==='hidden'){h.doc.hidden=true;h.doc.dispatchEvent(new Evt('visibilitychange'))}else if(['blur','resize'].includes(cancel))h.ctx.window.dispatchEvent(new Evt(cancel));else h.doc.dispatchEvent(new Evt(cancel,{pointerId:7}));
  assert.equal(h.doc.querySelector('.module-placeholder'),undefined);assert.equal(h.doc.querySelector('.drag-ghost'),undefined);assert.equal(h.ctx.window.frame,null);assert.equal(grid.capture,null);assert.equal(h.writes.length,0);assert(!panel.hidden);
 }
});
test('explicit blank exclusions preserve buttons, text, cards, articles, scrollbar gutters and native touch scrolling',()=>{
 const h=fixture();h.get('edit-button').click();geometry(h);const panel=h.get('module-panel-learning'), scroller=panel.querySelector('.module-scroll');scroller.rect={left:0,right:500,top:0,bottom:200,width:500,height:200};scroller.clientWidth=480;scroller.clientHeight=200;
 for(const target of [panel.querySelector('.module-title-edit'),panel.querySelector('.course-card'),panel.querySelector('.course-link'),panel.querySelector('.entry-link'),panel.querySelector('.course-toolbar')]){down(h,target);move(h);assert.equal(h.doc.querySelector('.module-placeholder'),undefined)}
 down(h,scroller,{clientX:490});move(h);assert.equal(h.doc.querySelector('.module-placeholder'),undefined);
 const touch=new Evt('pointerdown',{target:panel,button:0,pointerId:7,pointerType:'touch',clientX:10,clientY:10});panel.dispatchEvent(touch);assert(!touch.defaultPrevented);move(h);assert.equal(h.doc.querySelector('.module-placeholder'),undefined);
 down(h,panel.querySelector('.course-grid'));move(h);assert(h.doc.querySelector('.module-placeholder'));h.doc.dispatchEvent(new Evt('keydown',{key:'Escape'}));
});
test('completed module drop saves order once, undo restores it, and only matching tail click is suppressed',()=>{
 const h=fixture();h.get('edit-button').click();const before=h.config(), grid=geometry(h), panel=h.get('module-panel-learning');
 for(const node of grid.children)node.getBoundingClientRect=()=>Object.create(node.rect);
 down(h,panel);move(h);h.doc.dispatchEvent(new Evt('pointerup',{pointerId:7,clientX:100,clientY:890}));assert.equal(h.writes.length,1);assert.equal(h.config().modules.at(-1).id,'learning');
 const click=new Evt('click',{target:grid,detail:1,clientX:100,clientY:890});h.doc.dispatchEvent(click);assert(click.defaultPrevented);const next=new Evt('click',{target:h.get('add-module'),detail:1});h.doc.dispatchEvent(next);assert(!next.defaultPrevented);
 h.doc.querySelector('.toast-undo').click();assert.deepEqual(h.config(),before);
 down(h,panel);move(h);h.doc.dispatchEvent(new Evt('keydown',{key:'Escape'}));const unrelated=new Evt('click',{target:h.get('add-module'),detail:1});h.doc.dispatchEvent(unrelated);assert(!unrelated.defaultPrevented);
});

test('drag exceptions and sub-threshold release cannot leave capture or swallow the next normal click',()=>{
 const h=fixture();h.get('edit-button').click();geometry(h);const panel=h.get('module-panel-learning'), grid=h.get('module-grid');
 down(h,panel);h.doc.dispatchEvent(new Evt('pointerup',{pointerId:7,clientX:10,clientY:10}));
 const normal=new Evt('click',{target:panel,detail:1,clientX:10,clientY:10});h.doc.dispatchEvent(normal);assert(!normal.defaultPrevented);
 h.ctx.window.scrollBy=()=>{throw Error('test scroll failure')};down(h,panel);move(h);
 assert.equal(h.doc.querySelector('.module-placeholder'),undefined);assert.equal(h.doc.querySelector('.drag-ghost'),undefined);assert.equal(grid.capture,null);assert.equal(h.ctx.window.frame,null);assert.equal(h.writes.length,0);
});
test('module menus disable unavailable moves and keyboard focus skips them',()=>{
 const h=fixture();h.get('edit-button').click();const title=h.get('module-panel-learning').querySelector('.module-title-edit');title.focus();title.click();assert(h.get('editor').open);h.get('cancel-dialog').click();assert.equal(h.doc.activeElement,title);
 const trigger=h.get('module-panel-learning').querySelector('.course-more-wrap').querySelector('button');trigger.dispatchEvent(new Evt('keydown',{key:'ArrowDown'}));
 const menu=h.get('module-menu-learning'), items=menu.children;assert(items[1].disabled);assert.equal(h.doc.activeElement,items[0]);
 menu.dispatchEvent(new Evt('keydown',{key:'ArrowDown'}));assert.equal(h.doc.activeElement,items[2]);menu.dispatchEvent(new Evt('keydown',{key:'Escape'}));assert.equal(h.doc.activeElement,trigger);
 moduleAction(h,'learning','下移');assert.deepEqual(h.config().modules.slice(0,2).map(m=>m.id),['reading','learning']);
});
test('Reader articles cannot launch while organizing; user main-site edits remain ordinary configuration',async()=>{
 const h=fixture(), timers=[];h.ctx.setTimeout=(fn,ms)=>{timers.push({fn,ms});return 1};h.ctx.clearInterval=()=>{};
 h.ctx.fetch=async()=>Response.json({version:1,initialized:true,connected:true,webhookConfigured:true,items:[{id:'a',title:'Article',source:'Source',savedAt:Date.now(),url:'https://read.readwise.io/read/a'}]});
 h.run(root+'/src/frontend/reader.js');timers.find(t=>t.ms===80).fn();await settle();
 const article=h.doc.querySelector('.reader-article'), ordinary=new Evt('click');article.dispatchEvent(ordinary);assert(!ordinary.defaultPrevented);
 h.get('edit-button').click();for(const type of ['click','auxclick']){const blocked=new Evt(type);article.dispatchEvent(blocked);assert(blocked.defaultPrevented)}
 const home=h.doc.querySelector('.reader-home'), event=new Evt('click');home.dispatchEvent(event);assert(event.defaultPrevented);assert.equal(h.get('dialog-title').textContent,'编辑入口');
 h.get('field-url').value='https://read.readwise.io/custom';submit(h);assert.equal(h.doc.querySelectorAll('.reader-home').length,1);assert.equal(h.get('reading-links').children.length,0);assert.equal(h.doc.querySelector('.reader-home').href,'https://read.readwise.io/custom');
});
