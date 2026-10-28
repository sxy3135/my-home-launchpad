const {moduleAction: homeAction}=require("./fixtures/editor-actions.cjs");
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const {harness, Evt, root} = require('./fixtures/dom.cjs');
const KEY = 'my-home-launchpad.config.v1', seed = require('./fixtures/config.json');
const copy = x => JSON.parse(JSON.stringify(x));
const settle = async () => {for (let i = 0; i < 30; i++) await Promise.resolve()};
function fixture(saved) {
  const h = harness();
  for (const name of ['icons', 'model', 'ui', 'interactions', 'module-layout']) h.run(root + '/src/frontend/' + name + '.js');
  if (saved !== undefined) h.store.set(KEY, typeof saved === 'string' ? saved : JSON.stringify(saved));
  h.ctx.fetch = () => {throw Error('Module editing must not request the network')};
  h.run(root + '/src/frontend/app.js');
  return Object.assign(h, {M: h.ctx.window.HomeModel, get: id => h.doc.getElementById(id), config: () => JSON.parse(h.store.get(KEY))});
}
function choose(h, id, value) {
  h.get(id + '-button').click();
  const options = h.get(id + '-options');
  const index = [...options.children].findIndex(e => e.textContent === value);
  assert(index >= 0, id + ': ' + value); options.children[index].click();
}
function submit(h) {h.get('editor-form').dispatchEvent(new Evt('submit'));}
const moduleAction = homeAction;
function createModule(h, name, size = '小 · 1 列', position) {
  h.get('add-module').click(); h.get('field-name').value = name; choose(h, 'field-size', size);
  if (position !== undefined) choose(h, 'field-position', position);
  submit(h); assert(!h.get('editor').open, h.get('form-error').textContent);
  return h.config().modules.find(m => m.name === name.trim());
}
function undo(h) {h.doc.querySelector('.toast-undo').click();}
function geometry(h) {
  const grid = h.get('module-grid'); grid.rect = {left:0,right:900,top:0,bottom:600,width:900,height:600};
  const boxes = [[0,0,900,180],[0,200,440,360],[460,200,680,290],[700,200,900,310],[0,380,220,470]];
  grid.children.forEach((e, i) => {const [left, top, right, bottom] = boxes[i % boxes.length];e.rect = {left,top,right,bottom,width:right-left,height:bottom-top}});
  return grid;
}
function begin(h, handle, id=1, x=10, y=10) {
  handle.dispatchEvent(new Evt('pointerdown',{button:0,pointerId:id,clientX:x,clientY:y,isPrimary:true}));
  h.doc.dispatchEvent(new Evt('pointermove',{pointerId:id,clientX:200,clientY:450}));
}
test('grid row geometry is the single height source for saved spans, editor labels and gap-aware stacking', () => {
  const initial=fixture(), M=initial.M;
  assert.deepEqual([2,3,4].map(n=>M.moduleHeight(n)),[160,248,336]);
  assert.equal(M.moduleHeight(4),2*M.moduleHeight(2)+M.moduleGap);
  const config=copy(M.restoreConfig(require("./fixtures/config.json").config));
  const left=config.modules.find(m=>m.type==='learning'), upper=config.modules.find(m=>m.type==='reader'), lower=config.modules.find(m=>m.type==='shortcuts');
  config.modules=[left,upper,lower];config.modules.forEach(m=>m.size='medium');
  [left.heightUnits,upper.heightUnits,lower.heightUnits]=[4,2,2];
  const before=copy(config), h=fixture(config);
  assert.deepEqual(h.config(),before);assert.deepEqual(h.get('module-grid').children.map(p=>p.dataset.moduleId),before.modules.map(m=>m.id));
  for(const m of before.modules){const panel=h.get('module-panel-'+m.id);assert.equal(panel.style['--module-height-units'],String(m.heightUnits));assert.equal(panel.style.height,undefined);}
  assert.equal(h.doc.documentElement.style['--module-row-height'],'72px');assert.equal(h.doc.documentElement.style['--module-gap'],'16px');
  h.get('edit-button').click();assert.deepEqual(h.config(),before);moduleAction(h,left.id,'编辑');
  assert.deepEqual(h.get('field-heightUnits-options').children.map(e=>e.textContent),['2 份 · 160px','3 份 · 248px','4 份 · 336px']);h.get('cancel-dialog').click();
  h.get('edit-button').click();assert.deepEqual(h.config(),before);
  for(const width of [1440,900,390,1440]){h.ctx.window.innerWidth=width;h.ctx.window.dispatchEvent(new Evt('resize'));}
  assert.deepEqual(h.config(),before);assert.deepEqual(fixture(h.config()).config(),before);
  const css=fs.readFileSync(root+'/src/frontend/style.css','utf8');
  assert(css.includes('grid-auto-rows:var(--module-row-height)'));assert(css.includes('grid-auto-flow:row'));assert(!css.includes('dense'));
  assert(css.includes('gap:var(--module-gap)'));assert(css.includes('.module-grid>.section-panel,.module-placeholder{grid-row:span'));
  assert(!css.includes('height:var(--module-height)'));
});
test('changing central row and gap definitions updates the formula, grid variables and editor heights together', () => {
  const h=harness();h.run(root+'/src/frontend/icons.js');
  const source=fs.readFileSync(root+'/src/frontend/model.js','utf8').replace('moduleRowHeight = 72, moduleGap = 16','moduleRowHeight = 76, moduleGap = 20');
  require('node:vm').runInNewContext(source,h.ctx);
  for(const name of ['ui','interactions','module-layout','app'])h.run(root+'/src/frontend/'+name+'.js');
  const M=h.ctx.window.HomeModel;
  assert.equal(M.moduleHeight(4),2*M.moduleHeight(2)+20);
  assert.equal(h.doc.documentElement.style['--module-row-height'],'76px');assert.equal(h.doc.documentElement.style['--module-gap'],'20px');
  h.doc.getElementById('edit-button').click();homeAction(h,'learning','编辑');
  assert.deepEqual(h.doc.getElementById('field-heightUnits-options').children.map(e=>e.textContent),['2 份 · 172px','3 份 · 268px','4 份 · 364px']);
});
test('insertion handles a tall left peer alongside a lower right module, without requiring identical top coordinates', () => {
  const h=fixture(), I=h.ctx.window.HomeInteractions;
  const rects=[{left:0,right:480,top:0,bottom:336},{left:496,right:976,top:0,bottom:160},{left:496,right:976,top:176,bottom:336}];
  assert.equal(I.moduleInsertionAt(rects,900,190).horizontal,true);assert.equal(I.moduleInsertionAt(rects,900,190).index,3);
  assert.equal(I.moduleInsertionAt(rects,520,300).horizontal,true);assert.equal(I.moduleInsertionAt(rects,520,300).index,2);
  const wide={left:0,right:976,top:352,bottom:688};
  assert.equal(I.moduleInsertionAt([...rects,wide],900,360).horizontal,false);assert.equal(I.moduleInsertionAt([...rects,wide],900,360).index,3);
  assert.equal(I.moduleInsertionAt([...rects,wide],100,680).index,4);
});
test('height migration defaults by type, repeats without resets, and isolates invalid height recovery without mutating raw data', () => {
  const h=fixture(), M=h.M, old=copy(seed.config), next=M.restoreConfig(old);
  assert.equal(M.moduleRowHeight,72);assert.equal(M.moduleGap,16);
  assert.deepEqual(copy(next.modules.map(m=>m.heightUnits)),copy(next.modules.map(m=>m.type==='learning'?4:3)));
  for(const module of next.modules) delete module.heightUnits;
  const upgraded=M.restoreConfig(next);upgraded.modules.forEach((m,i)=>m.heightUnits=2+i%3);
  assert.deepEqual(copy(M.restoreConfig(M.restoreConfig(upgraded))),copy(upgraded));
  M.saveModule(upgraded,'learning',{name:'学习',size:'medium',position:3});
  assert.equal(M.getModule(upgraded,'learning').heightUnits,2);
  for(const invalid of [null,0,1,5,2.5,'3']) {
    const bad=copy(upgraded), target=bad.modules.find(m=>m.type==='reader');target.heightUnits=invalid;
    const raw=JSON.stringify(bad), issues=[];
    assert.throws(()=>M.validateConfig(bad),/高度/);
    const recovered=M.restoreConfig(bad,{recover:true,issues});
    assert(issues.some(x=>x.includes('高度')));assert.equal(JSON.stringify(bad),raw);
    assert.deepEqual(copy(recovered.semesters),bad.semesters);
    assert.deepEqual(copy(recovered.modules.filter(m=>m.id!==target.id)),bad.modules.filter(m=>m.id!==target.id));
    const protectedUI=fixture(raw);assert.equal(protectedUI.store.get(KEY),raw);assert.equal(protectedUI.writes.length,0);
    protectedUI.get('edit-button').click();assert(!protectedUI.doc.body.classList.contains('editing'));
  }
});
test('module height editor persists units independently of width/content/order and supports undo, reload and actual export/import', async () => {
  const h=fixture();h.get('edit-button').click();const added=createModule(h,'高度测试');
  assert.equal(added.heightUnits,3);
  moduleAction(h,'learning','编辑');
  assert.equal(h.get('field-heightUnits').value,'4');
  assert.deepEqual(h.get('field-heightUnits-options').children.map(e=>e.textContent),['2 份 · 160px','3 份 · 248px','4 份 · 336px']);
  const before=copy(h.config());choose(h,'field-heightUnits','2 份 · 160px');submit(h);
  assert.equal(h.config().modules.find(m=>m.id==='learning').heightUnits,2);
  assert.equal(h.get('module-panel-learning').style['--module-height-units'],'2');
  assert.deepEqual(h.config().semesters,before.semesters);
  assert.deepEqual(h.config().modules.find(m=>m.id==='learning').links,before.modules.find(m=>m.id==='learning').links);
  undo(h);assert.deepEqual(h.config(),before);
  moduleAction(h,added.id,'编辑');choose(h,'field-heightUnits','4 份 · 336px');choose(h,'field-size','中 · 2 列');submit(h);
  homeAction(h,added.id,'添加入口');h.get('field-name').value='新增内容';h.get('field-url').value='https://example.com/new';submit(h);
  assert.equal(h.config().modules.find(m=>m.id===added.id).heightUnits,4);
  const saved=copy(h.config()), writes=h.writes.length;
  for(const width of [1440,900,390,1440]){h.ctx.window.innerWidth=width;h.ctx.window.dispatchEvent(new Evt('resize'));}
  h.get('edit-button').click();assert.deepEqual(h.config(),saved);assert.equal(h.writes.length,writes);
  const loaded=fixture(saved);assert.deepEqual(loaded.config(),saved);
  for(const m of saved.modules)assert.equal(loaded.get('module-panel-'+m.id).style['--module-height-units'],String(m.heightUnits));
  let blob;h.ctx.URL=class extends URL{static createObjectURL(b){blob=b;return 'blob:heights'}static revokeObjectURL(){}};
  h.get('export-button').click();const exported=JSON.parse(await blob.text());assert.deepEqual(exported,saved);
  const receiving=fixture();receiving.get('import-file').files=[{size:100,text:async()=>JSON.stringify(exported)}];receiving.get('import-file').dispatchEvent(new Evt('change'));await settle();
  receiving.get('confirm-yes').click();await settle();assert.deepEqual(receiving.config(),saved);
});
test('mixed saved heights use measured drag placeholders and cancellation preserves units and logical order', () => {
  const initial=fixture(), config=initial.M.restoreConfig(require("./fixtures/config.json").config);config.modules.forEach((m,i)=>m.heightUnits=2+i%3);
  const h=fixture(config);h.get('edit-button').click();const before=copy(h.config());geometry(h);
  for(const panel of h.get('module-grid').children){const m=before.modules.find(m=>m.id===panel.dataset.moduleId);panel.rect.height=h.M.moduleHeight(m.heightUnits+1);panel.rect.bottom=panel.rect.top+panel.rect.height;}
  const handle=h.get('module-panel-learning');begin(h,handle);
  assert.equal(h.doc.querySelector('.module-placeholder').style['--module-height-units'],'2');assert.equal(h.doc.querySelector('.module-placeholder').style.height,undefined);
  assert.equal(h.doc.querySelector('.drag-ghost').style.height,'248px');
  h.doc.dispatchEvent(new Evt('pointercancel',{pointerId:1}));assert.deepEqual(h.config(),before);assert.equal(h.doc.querySelector('.module-placeholder'),undefined);
});
test('legacy order/content migrate once into one modules model; IDs, paths, roles and preferences survive', () => {
  const h = fixture(), M = h.M, old = copy(seed.config);
  old.sectionOrder = ['affairs','investment','reading','learning','entertainment'];
  old.sections.affairs[0].name = '自定义邮箱'; old.sections.learning.reverse();
  old.semesters[0].courses.reverse(); old.semesters[0].courses[0].links[1].launchRole = 'gpt';
  old.semesters[0].courses[0].links[2].folderPaths = {windows:'D:\\Custom',mac:'/Users/中文/资料 & 100%'};
  old.extraPreference = {preserve: true}; const raw = JSON.stringify(old), next = M.restoreConfig(old);
  assert.equal(JSON.stringify(old), raw); assert.equal(next.version, 4);
  assert(!Object.hasOwn(next, 'sections')); assert(!Object.hasOwn(next, 'sectionOrder')); assert(!Object.hasOwn(M, 'sections'));
  assert.deepEqual(copy(next.modules.map(m => m.id)), old.sectionOrder);
  assert.deepEqual(copy(next.modules.map(m => m.size)), ['small','small','medium','wide','small']);
  assert.deepEqual(copy(M.getModule(next,'affairs').links), old.sections.affairs);
  assert.deepEqual(copy(M.getModule(next,'learning').links), old.sections.learning);
  assert.deepEqual(copy(next.semesters[0].courses.map(c=>c.id)), old.semesters[0].courses.map(c=>c.id));
  assert.equal(next.semesters[0].courses[0].links[2].folderPaths.mac,'/Users/中文/资料 & 100%');
  M.saveModule(next, 'learning', {name:'课程中心',size:'small',position:4});
  M.saveModule(next, 'reading', {name:'Inbox',size:'wide',position:0});
  assert.deepEqual(copy(M.restoreConfig(M.restoreConfig(next))), copy(next));
  assert.deepEqual(copy(M.validateConfig(next)), copy(next)); assert.deepEqual(copy(next.extraPreference), old.extraPreference);
  const missing = copy(next); delete missing.modules[0].size;
  assert.equal(M.validateConfig(missing).modules[0].size,'medium');
});
test('version 1 configuration preserves edited links and fills missing sections with empty modules', () => {
  const h=fixture(), old=copy(seed.config), home=old.sections.learning.shift();
  old.version=1; old.home={...home,name:'自己的笔记首页',icon:'book'}; delete old.sections.investment;
  old.sections.affairs.push({id:'assets',name:'Assets',url:'https://example.com/my-assets',icon:'chart'});
  const migrated=h.M.restoreConfig(old);
  assert.equal(h.M.getModule(migrated,'learning').links[0].name,'自己的笔记首页');
  assert.equal(h.M.getModule(migrated,'affairs').links.at(-1).url,'https://example.com/my-assets');
  assert.deepEqual(copy(h.M.restoreConfig(migrated)),copy(migrated));
});
test('module types are independent of ID/name/order; exactly one learning and Reader, variable ordinary module count', () => {
  const h=fixture(), c=h.M.restoreConfig(require("./fixtures/config.json").config);
  c.modules[0].id='custom-study';c.modules[0].name='不是学习';c.modules[1].id='custom-reader';c.modules[1].name='不是阅读';
  h.M.reorderItem(c.modules,'custom-study',null);
  const imported=fixture(c);
  assert.equal(imported.get('courses').closest('.section-panel'),imported.get('module-panel-custom-study'));
  assert.equal(imported.get('reader-items').closest('.section-panel'),imported.get('module-panel-custom-reader'));
  assert.equal(imported.get('module-grid').children.at(-1).dataset.moduleType,'learning');
  for(const id of ['custom-study','custom-reader'])assert.throws(()=>h.M.removeModule(c,id));
  const duplicate=copy(c); duplicate.modules.push({...duplicate.modules[0],id:'other-reader',links:[]});assert.throws(()=>h.M.validateConfig(duplicate));
  const noLearning=copy(c);noLearning.modules=noLearning.modules.filter(m=>m.type!=='learning');assert.throws(()=>h.M.validateConfig(noLearning));
  h.M.removeModule(c,'affairs');const added=h.M.saveModule(c,null,{name:'新建模块',size:'medium',position:0});assert.equal(added.type,'shortcuts');
  assert.equal(h.M.validateConfig(c).modules.length,5);
});
test('real module editor creates, validates duplicate/blank names, resizes/reorders without losing contents and supports undo/reload', () => {
  const h=fixture();h.get('edit-button').click();
  const module=createModule(h,'  我的工具  ','中 · 2 列','第 1 位');
  assert.equal(module.type,'shortcuts');assert.equal(module.size,'medium');assert.equal(h.config().modules[0].id,module.id);
  assert(h.get('module-panel-'+module.id).querySelector('.empty-entry').textContent.includes('添加第一个入口'));
  const original=h.config().modules.find(m=>m.type==='learning'), courses=copy(h.config().semesters);
  moduleAction(h,'learning','编辑');h.get('field-name').value='课程中心';choose(h,'field-size','小 · 1 列');choose(h,'field-position','最后');submit(h);
  assert.equal(h.config().modules.at(-1).name,'课程中心');assert.equal(h.config().modules.at(-1).size,'small');
  assert.deepEqual(h.config().modules.at(-1).links,original.links);assert.deepEqual(h.config().semesters,courses);
  assert.equal(h.doc.activeElement.dataset.focusId,'module:learning');
  undo(h);assert.deepEqual(h.config().modules.find(m=>m.id==='learning'),original);
  moduleAction(h,module.id,'编辑');h.get('field-name').value='学习';submit(h);assert(h.get('editor').open);assert(h.get('form-error').textContent.includes('同名'));
  h.get('field-name').value='  ';submit(h);assert(h.get('form-error').textContent);h.get('cancel-dialog').click();
  const loaded=fixture(h.store.get(KEY));assert.deepEqual(loaded.config(),h.config());
  assert.equal(loaded.get('module-grid').children[0].dataset.moduleId,module.id);assert.equal(loaded.get('layout-toolbar').hidden,true);
  assert.equal(loaded.get('module-panel-'+module.id).querySelector('.module-empty').textContent,'暂无入口');
  assert.equal(loaded.get('module-panel-'+module.id).querySelector('.empty-entry'),undefined);
});
test('entry editor uses current modules, moves stable entries to new modules, preserves all targets and sorts within its scope', () => {
  const h=fixture();h.get('edit-button').click();const added=createModule(h,'自建资料');
  homeAction(h,added.id,'添加入口');h.get('field-name').value='网页资料';h.get('field-url').value='https://example.com/a?q=%E4%B8%AD%E6%96%87';submit(h);
  assert.equal(h.config().modules.find(m=>m.id===added.id).links.length,1);
  const entry=h.config().modules.find(m=>m.id==='affairs').links[0];
  h.get('module-panel-affairs').querySelector('.entry-link').click();
  assert(h.get('field-module-options').textContent.includes('自建资料'));choose(h,'field-module','自建资料');choose(h,'field-position','第一位');submit(h);
  const links=h.config().modules.find(m=>m.id===added.id).links;
  assert.deepEqual(links[0],entry);assert(!h.config().modules.find(m=>m.id==='affairs').links.some(e=>e.id===entry.id));
  const otherModules=copy(h.config().modules.filter(m=>m.id!==added.id)), semesters=copy(h.config().semesters);
  h.get('module-panel-'+added.id).querySelector('.entry-link').click();choose(h,'field-position','最后');submit(h);
  assert.equal(h.config().modules.find(m=>m.id===added.id).links[1].id,entry.id);
  assert.deepEqual(h.config().modules.filter(m=>m.id!==added.id),otherModules);assert.deepEqual(h.config().semesters,semesters);
});
test('ordinary module deletion reports count/name, cancellation preserves data, confirmed delete is undoable and special modules have no delete control', async () => {
  const h=fixture();h.get('edit-button').click();const before=h.M.restoreConfig(require("./fixtures/config.json").config), module=before.modules.find(m=>m.id==='affairs');
  moduleAction(h,'affairs','删除');assert(h.get('editor-confirm').textContent.includes(module.name));assert(h.get('editor-confirm').textContent.includes(String(module.links.length)+' 个入口'));
  h.get('editor-confirm-cancel').click();await settle();h.get('cancel-dialog').click();assert.equal(h.writes.length,0);
  moduleAction(h,'affairs','删除');h.get('editor-confirm-yes').click();await settle();assert(!h.config().modules.some(m=>m.id==='affairs'));
  undo(h);assert.deepEqual(h.config().modules.find(m=>m.id==='affairs'),copy(module));
  for(const id of ['learning','reading']){
    assert(!h.get('module-panel-'+id).querySelector('.editing-controls'));
    moduleAction(h,id,'编辑');assert.equal(h.get('editor-delete').hidden,true);h.get('cancel-dialog').click();
  }
});
test('module drag uses same-size live placeholder, preserves DOM on cancel, commits logical order and never launches a course', () => {
  const h=fixture();h.get('edit-button').click();const before=copy(h.M.restoreConfig(require("./fixtures/config.json").config).modules.map(m=>m.id)), grid=geometry(h);
  const handle=h.get('module-panel-learning');
  // AX/DOM rectangles expose properties through a prototype in real browsers.
  for(const panel of grid.children)panel.getBoundingClientRect=()=>Object.create(panel.rect);
  begin(h,handle);assert.equal(grid.capture,1);const placeholder=h.doc.querySelector('.module-placeholder');assert(placeholder);assert(placeholder.className.includes('module-size-wide'));assert.equal(placeholder.style['--module-height-units'],'4');assert.equal(placeholder.style.height,undefined);
  assert.equal(h.get('module-panel-learning').hidden,true);assert(h.doc.body.className.includes('is-sorting'));
  assert.equal(h.doc.querySelectorAll('.drag-ghost').length,1);assert.equal(grid.children.at(-1),placeholder);
  assert.equal(h.get('courses').querySelector('.sort-handle'),undefined);
  h.doc.dispatchEvent(new Evt('keydown',{key:'Escape'}));assert.equal(h.doc.querySelector('.module-placeholder'),undefined);
  assert.deepEqual(grid.children.map(e=>e.dataset.moduleId),before);assert.equal(h.get('module-panel-learning').hidden,false);assert.equal(h.writes.length,0);
  begin(h,handle,2);h.doc.dispatchEvent(new Evt('pointerup',{pointerId:2,clientX:200,clientY:450}));
  assert.equal(h.config().modules.at(-1).type,'learning');assert.equal(h.doc.querySelectorAll('.drag-ghost').length,0);assert(!h.doc.body.className.includes('is-sorting'));
  assert.equal(h.ctx.window.opened,undefined);undo(h);assert.deepEqual(h.config().modules.map(m=>m.id),before);
  const next=h.get('module-panel-learning');geometry(h);begin(h,next,3);h.doc.dispatchEvent(new Evt('pointercancel',{pointerId:3}));assert.equal(h.doc.querySelector('.module-placeholder'),undefined);
  assert.deepEqual(h.get('module-grid').children.map(e=>e.dataset.moduleId),before);
});
test('module insertion distinguishes wide singleton rows and horizontal peers; responsive spans and shared card tracks never persist screen changes', () => {
  const h=fixture(), I=h.ctx.window.HomeInteractions, r=[{left:0,right:1000,top:0,bottom:200},{left:0,right:480,top:230,bottom:500},{left:510,right:740,top:230,bottom:330}];
  assert.equal(I.moduleInsertionAt(r,900,50).index,0);assert.equal(I.moduleInsertionAt(r,10,190).index,1);
  assert.equal(I.moduleInsertionAt(r,700,270).index,3);assert.equal(I.moduleInsertionAt(r,20,270).index,1);
  h.get('edit-button').click();const before=h.writes.length;
  for(const width of [1440,850,390,1440]){h.ctx.window.innerWidth=width;h.ctx.window.dispatchEvent(new Evt('resize'));}
  assert.equal(h.writes.length,before);
  const css=fs.readFileSync(root+'/src/frontend/style.css','utf8');assert(css.includes('grid-auto-flow:row'));assert(!css.includes('dense'));
  assert(css.includes('.module-size-small{grid-column:span 1}'));assert(css.includes('.module-size-medium{grid-column:span 2}'));assert(css.includes('.module-size-wide{grid-column:span 4}'));
  assert(css.includes('@media(max-width:1212px)'));assert(css.includes('@media(max-width:608px)'));assert(css.includes('container-type:inline-size'));assert(css.includes('grid-template-columns:repeat(var(--card-columns),minmax(0,var(--card-width)))'));
  assert(!css.includes('.utility-rail'));assert(!fs.readFileSync(root+'/src/frontend/app.js','utf8').includes('固定首行'));
});
test('broken/partially invalid configuration retains raw storage, blocks ordinary edits, exports original bytes and restores only after confirmed valid import', async () => {
  for(const corrupted of ['{invalid JSON', (()=>{const c=copy(seed.config);c.sections.affairs[0].url='javascript:bad()';return JSON.stringify(c)})()]){
    const h=fixture(corrupted);assert.equal(h.store.get(KEY),corrupted);assert.equal(h.writes.length,0);assert.equal(h.get('config-recovery').hidden,false);
    h.get('edit-button').click();assert(!h.doc.body.className.includes('editing'));assert.equal(h.store.get(KEY),corrupted);
    let blob;h.ctx.URL=class extends URL {static createObjectURL(value){blob=value;return 'blob:backup'}static revokeObjectURL(){}};
    h.get('export-button').click();assert.equal(await blob.text(),corrupted);
    if(corrupted.startsWith('{"')){assert(h.get('courses').children.length>0);assert(h.get('module-panel-affairs').querySelectorAll('.entry-link').length>0);}
    h.get('import-file').files=[{size:100,text:async()=>JSON.stringify(seed.config)}];h.get('import-file').dispatchEvent(new Evt('change'));await settle();assert(h.get('confirm-dialog').open);h.get('confirm-yes').click();await settle();
    assert.equal(h.config().version,4);assert.equal(h.get('config-recovery').hidden,true);h.get('edit-button').click();assert(h.doc.body.className.includes('editing'));
  }
});
test('partial recovery retains healthy modules/courses and never mutates original input; invalid shapes and duplicate IDs cannot overwrite', () => {
  const h=fixture(), c=h.M.restoreConfig(require("./fixtures/config.json").config);c.modules[2].links[0].url='javascript:bad';c.semesters[0].courses[2].name='';
  const raw=JSON.stringify(c), issues=[], repaired=h.M.restoreConfig(c,{recover:true,issues});
  assert.equal(JSON.stringify(c),raw);assert(issues.length>=2);assert.equal(repaired.modules.length,5);assert.equal(repaired.semesters[0].courses.length,7);
  assert.equal(repaired.modules[2].links.length,c.modules[2].links.length);assert.equal(repaired.modules[0].links.length,c.modules[0].links.length);
  assert.equal(repaired.modules[2].links[0].url,'');assert.equal(repaired.semesters[0].courses[2].name,'待恢复课程');
  assert.throws(()=>h.M.restoreConfig(c));
  const bad=copy(h.M.restoreConfig(require("./fixtures/config.json").config));bad.modules[2].id=bad.modules[0].id;assert.throws(()=>h.M.validateConfig(bad));
});
test('Reader state, bindings and refresh timer survive module rename/resize/order and module IDs imported by type', async () => {
  const h=fixture(), timers=new Map, intervals=new Map, calls=[];let id=0;
  h.ctx.setTimeout=(fn,ms)=>{timers.set(++id,{fn,ms});return id};h.ctx.clearTimeout=i=>timers.delete(i);
  h.ctx.setInterval=(fn,ms)=>{intervals.set(++id,{fn,ms});return id};h.ctx.clearInterval=i=>intervals.delete(i);
  const article={id:'a',title:'完整的长标题 '+ '很长'.repeat(20),source:'很长的文章来源',savedAt:Date.now(),url:'https://read.readwise.io/read/a'};
  h.ctx.fetch=async path=>{calls.push(path);return Response.json(path==='/api/reader/sync'?{status:'updated'}:{version:1,initialized:true,connected:true,webhookConfigured:true,items:[article]})};
  h.run(root+'/src/frontend/reader.js');[...timers.values()].find(t=>t.ms===80).fn();await settle();
  const list=h.get('reader-items'), refresh=h.get('reader-refresh'), row=list.children[0], count=calls.length, timerCount=intervals.size;
  assert.equal(list.children.length,1);assert.equal(row.querySelector('.reader-article-title').title,article.title);
  h.get('edit-button').click();moduleAction(h,'reading','编辑');h.get('field-name').value='文章中心';choose(h,'field-size','小 · 1 列');choose(h,'field-position','最后');submit(h);
  assert.equal(h.get('reader-items'),list);assert.equal(list.children[0],row);assert.equal(h.get('reader-refresh'),refresh);assert.equal(calls.length,count);assert.equal(intervals.size,timerCount);
  const imported=h.config();imported.modules.find(m=>m.type==='reader').id='new-reader-id';
  h.get('import-file').files=[{size:100,text:async()=>JSON.stringify(imported)}];h.get('import-file').dispatchEvent(new Evt('change'));await settle();h.get('confirm-yes').click();await settle();
  assert.equal(h.get('reader-items'),list);assert.equal(h.get('reader-refresh'),refresh);assert.equal(calls.length,count);assert.equal(intervals.size,timerCount);
  assert.equal(list.closest('.section-panel').id,'module-panel-new-reader-id');
  refresh.click();await settle();assert.equal(calls.filter(p=>p==='/api/reader/sync').length,1);assert.equal(h.get('reader-items').children.length,1);
});
test('module export/import contains all fields and UI mutations leave appearance/search/trust keys untouched', async () => {
  const h=fixture();for(const [key,value] of [['myhome.appearance.v1','{"minute":1140}'],['myhome.search-engine','bing'],['myhome.device.v1','{"version":1,"expiresAt":123}']])h.store.set(key,value);
  h.get('edit-button').click();createModule(h,'额外入口','宽 · 4 列');let blob;h.ctx.URL=class extends URL{static createObjectURL(b){blob=b;return 'blob:config'}static revokeObjectURL(){}};
  h.get('export-button').click();const data=JSON.parse(await blob.text());assert.deepEqual(data,h.config());assert.equal(data.modules.at(-1).size,'wide');assert(!Object.hasOwn(data,'sectionOrder'));
  assert.deepEqual(copy(h.M.restoreConfig(data)),data);assert.equal(h.store.get('myhome.appearance.v1'),'{"minute":1140}');assert.equal(h.store.get('myhome.search-engine'),'bing');assert.equal(h.store.get('myhome.device.v1'),'{"version":1,"expiresAt":123}');
});
test('home course entries edit a single course draft; no nested drag scope remains', () => {
 const h=fixture();h.get('edit-button').click();const course=h.M.restoreConfig(require("./fixtures/config.json").config).semesters[0].courses[0];
 const entry=h.get('courses').children[0].querySelectorAll('.course-link')[1];entry.click();
 assert.equal(h.get('dialog-title').textContent,'编辑课程');assert.equal(h.get('field-entry-name').value,course.links[1].name);
 assert.equal(h.doc.querySelector('.sort-handle'),undefined);assert.equal(h.doc.querySelector('.editing-controls'),undefined);
 assert.equal(h.ctx.window.opened,undefined);assert.equal(h.writes.length,0);
});

test('new browser has no private defaults; first link persists and exports through the existing configuration', async () => {
 const h=harness();for(const name of ['icons','model','ui','interactions','module-layout'])h.run(root+'/src/frontend/'+name+'.js');
 const M=h.ctx.window.HomeModel, empty=M.defaultConfig();
 assert.equal(empty.semesters[0].courses.length,0);assert(empty.modules.every(m=>m.links.length===0));
 h.store.delete(KEY);h.run(root+'/src/frontend/app.js');h.get=id=>h.doc.getElementById(id);
 assert(!h.store.has(KEY));h.get('edit-button').click();homeAction(h,'learning','添加入口');
 h.get('field-name').value='我的入口';h.get('field-url').value='https://example.com/personal?a=1#note';submit(h);
 const saved=JSON.parse(h.store.get(KEY));assert.equal(saved.modules[0].links[0].url,'https://example.com/personal?a=1#note');
 let blob;h.ctx.URL=class extends URL{static createObjectURL(b){blob=b;return 'blob:test'}static revokeObjectURL(){}};
 h.get('export-button').click();assert.deepEqual(JSON.parse(await blob.text()),saved);
 assert.deepEqual(copy(M.restoreConfig(saved)),saved);
});
test('obsolete pathless folder aliases retain raw data rather than consulting hidden seeds', () => {
 const h=fixture(), input=copy(seed.config), entry=input.semesters[0].courses[0].links[2];
 delete entry.folderPaths;entry.url='myhome-folder://open/semester-1/course-1';const raw=JSON.stringify(input);
 assert.throws(()=>h.M.restoreConfig(input),/没有实际路径/);assert.equal(JSON.stringify(input),raw);
 const issues=[];h.M.restoreConfig(input,{recover:true,issues});assert(issues.length>0);
});
