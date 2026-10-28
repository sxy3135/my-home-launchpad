const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const {harness, Evt, root} = require('./fixtures/dom.cjs');
const KEY = 'my-home-launchpad.config.v1';
const copy = x => JSON.parse(JSON.stringify(x));
function fixture(saved, {popover = true} = {}) {
  const h = harness(), resize = [];
  if (!popover) {const factory = h.doc.createElement; h.doc.createElement = tag => {const node = factory(tag);node.showPopover = undefined;return node}}
  h.ctx.window.IntersectionObserver = class {constructor() {throw Error('Per-item observers must be removed')}};
  h.ctx.window.ResizeObserver = class {
    constructor(callback) {this.callback = callback;this.nodes = new Set;resize.push(this)}
    observe(node) {this.nodes.add(node)} unobserve(node) {this.nodes.delete(node)} disconnect() {this.nodes.clear()}
  };
  const values = {'--workspace-columns':'4','--module-gap':'16px','--module-padding':'16px','--module-focus-inset':'4px','--shortcut-gap':'8px','--shortcut-min-width':'104px','--card-min-width':'248px','--card-max-width':'352px','padding-left':'4px','padding-right':'4px','padding-bottom':'4px'};
  h.ctx.window.getComputedStyle = node => ({getPropertyValue:key => node.style.getPropertyValue(key) || values[key] || ''});
  for (const name of ['icons','model','ui','interactions','module-layout']) h.run(root+'/src/frontend/'+name+'.js');
  if (saved) h.store.set(KEY, JSON.stringify(saved));
  h.ctx.fetch = () => {throw Error('Layout must not request the network')};
  h.run(root+'/src/frontend/app.js');
  function measure(width = 1340, columns = 4, gutter = 10) {
    const grid = h.doc.getElementById('module-grid'); grid.clientWidth = width;
    values['--workspace-columns'] = String(columns);
    for (const panel of grid.children) {
      const span = panel.classList.contains('module-size-small') ? 1 : Math.min(columns,panel.classList.contains('module-size-medium') ? 2 : 4);
      const outer = (width-16*(columns-1))/columns*span+16*(span-1);
      const scroller = panel.querySelector('.module-scroll');
      scroller.offsetWidth = outer-34; scroller.clientWidth = scroller.offsetWidth-gutter;
      scroller.clientHeight = 230; scroller.scrollHeight = 600;
      scroller.rect = {left:0,right:scroller.clientWidth,top:100,bottom:330,width:scroller.clientWidth,height:230};
    }
    h.ctx.window.HomeModuleLayout.refresh();
  }
  measure();
  return {...h, values, measure, observers:resize, resize, get:id=>h.doc.getElementById(id), config:()=>JSON.parse(h.store.get(KEY)||JSON.stringify(h.ctx.window.HomeModel.restoreConfig(require("./fixtures/config.json").config)))};
}
test('exactly one native scroll area per module; shortcuts/toolbars/cards/status are inside, only heading stays outside', () => {
  const h = fixture();
  for (const panel of h.get('module-grid').children) {
    assert.equal(panel.querySelectorAll('.module-scroll').length,1);
    assert.equal(panel.querySelector('.section-heading').parentElement,panel);
    assert.equal(panel.querySelector('.section-links').closest('.module-scroll'),panel.querySelector('.module-scroll'));
  }
  const learning = h.get('courses').closest('.module-scroll'), reader = h.get('reader-items').closest('.module-scroll');
  assert.equal(h.get('study-links').closest('.module-scroll'),learning);
  assert.equal(h.doc.querySelector('.course-toolbar').closest('.module-scroll'),learning);
  for (const id of ['reading-links','reader-items','reader-status','reader-refresh','reader-setup-link']) assert.equal(h.get(id).closest('.module-scroll'),reader);
  assert.equal(h.get('reading-links').parentElement.children[0],h.get('reading-links'));
  assert.equal(h.get('reading-links').hidden,true);
  assert.equal(h.doc.querySelectorAll('.reader-home').length,1);
  h.get('edit-button').click();assert.equal(h.get('reading-links').hidden,true);
  assert.equal(h.doc.querySelectorAll('.reader-home').length,1);
  assert.equal(h.doc.querySelector('.reader-home-edit'),undefined);h.doc.querySelector('.reader-home').click();assert.equal(h.get('dialog-title').textContent,'编辑入口');h.get('cancel-dialog').click();
  const css = fs.readFileSync(root+'/src/frontend/style.css','utf8');
  assert(css.includes('grid-auto-rows:var(--module-row-height)'));assert(css.includes('--entry-height:44px'));
  assert(css.includes('--course-card-height:132px'));assert(css.includes('--course-padding:16px'));assert(!css.includes('--module-card-height'));assert(!css.includes('--module-scroll-height'));
  assert(css.includes('grid-row:span calc(var(--module-height-units,3) + var(--module-management-units))'));
  assert.equal(h.doc.documentElement.style['--module-row-height'],'72px');assert.equal(h.doc.documentElement.style['--module-gap'],'16px');
  assert(css.includes('overscroll-behavior-y:auto'));assert(!css.includes('scroll-snap'));
  assert(!css.includes('grid-auto-rows:calc'));assert(css.includes('align-content:start'));assert(css.includes('justify-content:start'));
  assert(css.includes('--focus-width:2px;--focus-offset:2px'));assert(css.includes('body:not(.is-sorting) .reader-item:has(:focus-visible)'));
  assert(css.includes('pointer-events:none'));assert(css.includes('prefers-reduced-motion:reduce'));
  assert(!css.includes('module-enter'));assert(!css.includes('initial-cut'));assert(!css.includes('animation:'));
  assert(!css.includes('position:sticky'));
  assert(css.includes('.module-grid>.section-panel,.module-placeholder{grid-row:span'));
  assert(!css.includes('var(--module-height-unit)'));assert(!css.includes('height:var(--module-height)'));
  // Source budget, not a browser measurement: one learning row fits four units;
  // Reader toolbar + two rows fit three, while the third remains in the native scroll area.
  const chrome=32+2+32+8+8;
  assert(chrome+8+44+22+32+12+132 <= h.ctx.window.HomeModel.moduleHeight(4));
  assert(chrome+32+8+52*2+12 <= h.ctx.window.HomeModel.moduleHeight(3));
  assert(chrome+32+8+52*3+12*2 > h.ctx.window.HomeModel.moduleHeight(3));
  assert(css.includes('align-items:start'));assert(css.includes('--module-management-units:1'));
  assert(18+15+2+14+2 <= 52); // Reader line boxes, gap, padding and border fit the common height.
});
test('Reader stays one full-width column independently of learning tracks and responsive sizes never persist preferences', () => {
  const h = fixture(), learning = h.get('module-panel-learning'), reader = h.get('module-panel-reading');
  assert.equal(learning.style['--card-width'],'299px');assert.equal(reader.style['--card-width'],'610px');
  assert.equal(learning.style['--card-columns'],'4');assert.equal(reader.style['--card-columns'],'1');
  const layout = h.ctx.window.HomeModuleLayout;
  for (const gutter of [0,8,16]) {
    h.measure(1340,4,gutter);
    assert.equal(parseFloat(reader.style['--card-width']),reader.querySelector('.module-scroll').clientWidth-8);
    assert.equal(learning.style['--card-columns'],'4');assert.equal(reader.style['--card-columns'],'1');
  }
  const saved = copy(h.config()), count = h.writes.length;
  h.measure(900,2);assert.equal(reader.style['--card-columns'],'1');assert.equal(parseFloat(reader.style['--card-width']),reader.querySelector('.module-scroll').clientWidth-8);
  h.measure(360,1);assert.equal(learning.style['--card-columns'],'1');assert.equal(reader.style['--card-columns'],'1');
  h.measure(1340,4);assert.deepEqual(h.config(),saved);assert.equal(h.writes.length,count);
  assert.equal(layout.columnsFor(600,292),2);assert.equal(layout.columnsFor(600,292),2);
  assert.equal(layout.columnsFor(240,292),1);
  assert.equal(layout.cardWidth({width:2000,columns:4,gap:20,padding:20,clearance:24}),352);
  assert.equal(layout.cardWidth({width:800,columns:4,gap:20,padding:20,clearance:24}),248);
  assert.equal(h.resize.length,1);
  // Course columns follow the available learning width; narrow panels may use fewer.
  for(const width of [1213,1280,1440,1560]) {
    h.measure(width-48,4);
    const available=learning.querySelector('.module-scroll').clientWidth-8;
    const track=parseFloat(learning.style['--card-width']), columns=Number(learning.style['--card-columns']);
    assert(columns>=1&&columns<=4);assert(columns*track+(columns-1)*12<=available+.5);
    assert.equal(reader.style['--card-columns'],'1');
  }
  const css=fs.readFileSync(root+'/src/frontend/style.css','utf8');
  assert(css.includes('.reader-items{display:grid;grid-template-columns:minmax(0,1fr)'));assert(!/\.course-grid,\.reader-items\{/.test(css));
});
test('native scroll shows all rows from the start and fades track boundaries, without item measurement or observers', () => {
  const h = fixture(), panel = h.get('module-panel-learning'), scroller = panel.querySelector('.module-scroll'), frame = panel.querySelector('.module-scroll-frame');
  const cards = [...h.get('courses').children];
  cards.forEach(node=>{node.getBoundingClientRect=()=>{throw Error('No per-item geometry reads in layout controller')}});
  h.ctx.window.HomeModuleLayout.refresh();
  assert(!frame.classList.contains('can-scroll-up'));assert(frame.classList.contains('can-scroll-down'));
  scroller.scrollTop=30;scroller.dispatchEvent(new Evt('scroll'));
  assert(frame.classList.contains('can-scroll-up'));assert(frame.classList.contains('can-scroll-down'));
  scroller.scrollTop=370;scroller.dispatchEvent(new Evt('scroll'));assert(!frame.classList.contains('can-scroll-down'));
  scroller.scrollHeight=230;scroller.scrollTop=0;h.ctx.window.HomeModuleLayout.refresh();
  assert(!frame.classList.contains('can-scroll-up'));assert(!frame.classList.contains('can-scroll-down'));
  h.get('edit-button').click();assert.equal(h.resize.length,1);
  assert(!h.doc.querySelector('.initial-cut'));assert(!h.doc.querySelector('.module-enter'));
});
test('edge strength continuously follows fractional distance and clamps elastic overscroll without timers or per-item reads', () => {
  const h=fixture(), edges=h.ctx.window.HomeModuleLayout.scrollEdges;
  let previous=0;
  for(let top=0;top<=20;top+=.125){const value=edges(top,600,230).top;assert(value>=previous);previous=value;}
  assert.equal(edges(10,600,230).top,.5);assert.equal(edges(360,600,230).bottom,.36);
  assert.equal(edges(-20,600,230).top,0);assert.equal(edges(400,600,230).bottom,0);
  assert(edges(.25,600,230).top>0);assert(edges(369.75,600,230).bottom>0);
  assert.equal(edges(50,100,230).top,0);assert.equal(edges(50,100,230).bottom,0);
  assert.equal(edges(0,600,86).size,16);assert.equal(edges(0,600,230).size,20);
  const scroller=h.get('courses').closest('.module-scroll'), frame=scroller.parentElement;
  for(const node of h.get('courses').children)node.getBoundingClientRect=()=>{throw Error('Scroll must not measure child geometry')};
  scroller.scrollTop=10;scroller.dispatchEvent(new Evt('scroll'));
  assert.equal(frame.style['--scroll-edge-top'],'0.500000');assert.equal(frame.style['--scroll-edge-bottom'],'0.720000');
  scroller.scrollTop=5;scroller.dispatchEvent(new Evt('scroll'));assert.equal(frame.style['--scroll-edge-top'],'0.156250');
  scroller.scrollHeight=200;h.ctx.window.HomeModuleLayout.refresh();assert.equal(frame.style['--scroll-edge-top'],'0.000000');assert.equal(frame.style['--scroll-edge-bottom'],'0.000000');
  const css=fs.readFileSync(root+'/src/frontend/style.css','utf8'), edgeCss=css.slice(css.indexOf('.scroll-fade{'),css.indexOf('.section-links{'));
  assert(!edgeCss.includes('transition:'));assert(!edgeCss.includes('backdrop-filter'));assert(!edgeCss.includes('mask-image'));
  assert(edgeCss.includes('prefers-reduced-transparency:reduce'));assert(!css.includes('.module-scroll-frame:has(:focus-visible) .scroll-fade'));
});
test('keyboard focus moves only an edge target into the clear region without disabling fades; pointer and offscreen restored focus retain offsets', async () => {
  const h=fixture(), scroller=h.get('courses').closest('.module-scroll'), frame=scroller.parentElement, target=h.get('courses').querySelector('.course-launch');
  scroller.scrollTop=100;scroller.dispatchEvent(new Evt('scroll'));const strength=frame.style['--scroll-edge-top'];
  target.rect={left:0,right:200,top:104,bottom:148,height:44,width:200};
  target.focus();scroller.dispatchEvent(new Evt('focusin',{target}));await Promise.resolve();assert.equal(scroller.scrollTop,100);
  target.matches=selector=>selector===':focus-visible';
  scroller.dispatchEvent(new Evt('focusin',{target}));await Promise.resolve();assert.equal(scroller.scrollTop,80);assert.equal(frame.style['--scroll-edge-top'],strength);
  target.rect={left:0,right:200,top:290,bottom:334,height:44,width:200};scroller.dispatchEvent(new Evt('focusin',{target}));await Promise.resolve();assert.equal(scroller.scrollTop,108);
  target.rect={left:0,right:200,top:160,bottom:204,height:44,width:200};scroller.dispatchEvent(new Evt('focusin',{target}));await Promise.resolve();assert.equal(scroller.scrollTop,108);
  target.rect={left:0,right:200,top:10,bottom:54,height:44,width:200};scroller.dispatchEvent(new Evt('focusin',{target}));scroller.scrollTop=125;await Promise.resolve();assert.equal(scroller.scrollTop,125);
  target.rect={left:0,right:200,top:104,bottom:148,height:44,width:200};scroller.dispatchEvent(new Evt('focusin',{target}));h.ctx.window.dispatchEvent(new Evt('myhome:lock'));await Promise.resolve();assert.equal(scroller.scrollTop,125);
});
test('edge layers use actual panel surface and spare the scrollbar; focus and scroll listeners detach on removal and locking', () => {
  const h=fixture(), panel=h.get('module-panel-entertainment'), scroller=panel.querySelector('.module-scroll'), frame=scroller.parentElement;
  h.values['background-color']='rgb(237, 244, 239)';h.measure(1340,4,14);
  assert.equal(frame.style['--scroll-edge-surface'],'rgb(237, 244, 239)');assert.equal(frame.style['--scroll-edge-gutter'],'14px');
  for(let i=0;i<5;i++)h.ctx.window.HomeModuleLayout.refresh();
  assert.equal(scroller.handlers.scroll.length,1);assert.equal(scroller.handlers.focusin.length,1);assert.equal(h.observers.length,1);
  panel.remove();h.ctx.window.HomeModuleLayout.refresh();assert.equal(scroller.handlers.scroll.length,0);assert.equal(scroller.handlers.focusin.length,0);
  const remaining=h.get('courses').closest('.module-scroll');h.ctx.window.dispatchEvent(new Evt('myhome:lock'));
  assert.equal(remaining.handlers.scroll.length,0);assert.equal(remaining.handlers.focusin.length,0);assert(h.observers.every(o=>o.nodes.size===0));
});
test('learning and Reader shortcuts match ordinary-module tracks at every breakpoint without stretching articles or changing saved sizes', () => {
  const initial=fixture(), config=initial.config();
  config.modules.find(m=>m.type==='reader').links.push({id:'reader-tool',name:'很长的阅读快捷入口名称'.repeat(5),icon:'book',url:'https://example.com/reader'});
  const h=fixture(config), learning=h.get('module-panel-learning'), reader=h.get('module-panel-reading'), ordinary=h.get('module-panel-entertainment');
  const saved=copy(h.config()), writes=h.writes.length;
  for(const [width,columns] of [[1340,4],[1232,4],[900,2],[600,1],[360,1],[1340,4]]) {
    h.measure(width,columns);
    const track=ordinary.style['--shortcut-width'];
    assert.equal(learning.style['--shortcut-width'],track);assert.equal(reader.style['--shortcut-width'],track);
    assert(parseFloat(track)<=ordinary.querySelector('.module-scroll').clientWidth-8);
    assert.equal(reader.style['--card-columns'],'1');
    assert.equal(parseFloat(reader.style['--card-width']),reader.querySelector('.module-scroll').clientWidth-8);
  }
  assert.equal(ordinary.style['--shortcut-width'],'131.5px');
  assert.equal(ordinary.style['--shortcut-columns'],'2');
  assert.equal(reader.style['--shortcut-columns'],'4');
  assert.equal(learning.style['--shortcut-columns'],'9');
  assert.equal(learning.style['--card-width'],'299px');
  assert.equal(h.get('reading-links').hidden,false);assert.equal(h.observers.length,1);
  assert.deepEqual(h.config(),saved);assert.equal(h.writes.length,writes);
  const css=fs.readFileSync(root+'/src/frontend/style.css','utf8');
  assert(!css.includes('.study-links{display:flex'));assert(!css.includes('inset 3px 0 0'));
  assert(css.includes('#semester-picker .select-trigger{height:32px;min-height:32px'));
});
test('shortcut columns have no course cap, use half a small module and fall back only below their independent readable width', () => {
  const h=fixture(), layout=h.ctx.window.HomeModuleLayout, ordinary=h.get('module-panel-entertainment'), learning=h.get('module-panel-learning');
  const width=ordinary.querySelector('.module-scroll').clientWidth-8;
  assert.equal(parseFloat(ordinary.style['--shortcut-width']),(width-8)/2);
  assert.equal(layout.shortcutColumnsFor(1200,120),9);assert.equal(layout.columnsFor(1200,120),4);
  const shortcut=learning.style['--shortcut-width'], columns=learning.style['--shortcut-columns'];
  h.values['--card-min-width']='320px';h.measure();
  assert.equal(learning.style['--card-columns'],'3');assert.equal(learning.style['--shortcut-width'],shortcut);assert.equal(learning.style['--shortcut-columns'],columns);
  for(const [width,count] of [[288,2],[240,1],[200,1],[1340,2]]) {
    h.measure(width,width===1340?4:1);
    assert.equal(ordinary.style['--shortcut-columns'],String(count));
    const available=ordinary.querySelector('.module-scroll').clientWidth-8;
    assert(count*parseFloat(ordinary.style['--shortcut-width'])+(count-1)*8 <= available+.5);
  }
});
test('compact entries retain full names and pending state while edit and drag controls remain outside the launch button', () => {
  const initial=fixture(), config=initial.config(), module=config.modules.find(m=>m.type==='shortcuts');
  module.links.push({id:'long-pending',name:'很长的入口名称，保留中文与符号 & %',url:'',icon:'link'});
  const h=fixture(config), panel=h.get('module-panel-'+module.id);
  const entry=panel.querySelectorAll('.section-item').at(-1), launch=entry.querySelector('.entry-link');
  assert.equal(launch.querySelector('.entry-title').title,module.links.at(-1).name);
  assert(launch.title.includes(module.links.at(-1).name));assert(launch.getAttribute('aria-label').includes('待配置'));
  assert.equal(entry.querySelector('.entry-status').parentElement,entry);assert.equal(launch.querySelector('.entry-status'),undefined);
  h.get('edit-button').click();
  const edit=panel.querySelectorAll('.entry-link').at(-1);
  assert.equal(panel.querySelector('.editing-controls'),undefined);assert.equal(panel.querySelector('.sort-handle'),undefined);
  edit.focus();edit.click();assert.equal(h.get('field-name').value,module.links.at(-1).name);
  h.get('cancel-dialog').click();assert.equal(h.doc.activeElement,edit);
  const css=fs.readFileSync(root+'/src/frontend/style.css','utf8');
  assert(css.includes('--reader-row-height:52px'));assert(css.includes('height:var(--reader-row-height)'));
  assert(!css.includes('padding-right:46px'));assert(!css.includes('.entry-link{padding:12px'));
});
test('rerender preserves offsets after browser-like clamping; semester changes reset only learning; observers clean up on lock', () => {
  const first = fixture(), config = first.ctx.window.HomeModel.restoreConfig(require("./fixtures/config.json").config);
  config.semesters.push({id:'next',name:'下学期',courses:[]});const h = fixture(config);
  const learning = h.get('courses').closest('.module-scroll'), reader = h.get('reader-items').closest('.module-scroll');
  learning.scrollTop=110;reader.scrollTop=85;
  const courses = h.get('courses'), replace = courses.replaceChildren.bind(courses);
  courses.replaceChildren = (...children) => {learning.scrollTop=0;replace(...children)};
  const count = h.observers.length;h.get('edit-button').click();assert.equal(learning.scrollTop,110);assert.equal(reader.scrollTop,85);assert.equal(h.observers.length,count);
  h.get('semester-select-button').click();h.get('semester-select-options').children.find(e=>e.textContent==='下学期').click();
  assert.equal(learning.scrollTop,0);assert.equal(reader.scrollTop,85);
  h.ctx.window.dispatchEvent(new Evt('myhome:lock'));assert(h.observers.every(o=>o.nodes.size===0));
});
test('extra shortcuts wrap in the same region, long course titles retain full tooltip and additional links stay accessible in top-layer menus', () => {
  const init=fixture(), config=init.ctx.window.HomeModel.restoreConfig(require("./fixtures/config.json").config), course=config.semesters[0].courses[0];
  course.name='很长课程名称 '.repeat(15);
  course.links.push({id:'extra-resource',name:'额外资源',icon:'link',url:'https://example.com/extra',launchRole:'none'});
  config.modules.find(m=>m.type==='reader').links.push({id:'extra-reader',name:'阅读工具',icon:'book',url:'https://example.com/reader'});
  const h=fixture(config), card=h.get('courses').children[0], more=card.querySelector('.course-more');
  assert(card.querySelector('.course-launch').title.includes(course.name));assert.equal(card.querySelector('.course-links').children.length,3);
  assert.equal(h.get('reading-links').hidden,false);assert(h.get('reading-links').classList.contains('study-links'));
  more.dispatchEvent(new Evt('keydown',{key:'ArrowDown'}));
  const menu=h.get('course-more-'+course.id);assert.equal(menu.parentElement,h.doc.body);assert.equal(menu.hidden,false);assert.equal(h.doc.activeElement.textContent,'额外资源');
  menu.dispatchEvent(new Evt('keydown',{key:'Escape'}));assert.equal(menu.hidden,true);assert.equal(h.doc.activeElement,more);
  more.dispatchEvent(new Evt('keydown',{key:'ArrowDown'}));menu.dispatchEvent(new Evt('keydown',{key:'Tab'}));assert.equal(menu.hidden,true);assert.equal(h.doc.activeElement,more);
  more.click();menu.children[0].click();menu.dispatchEvent(new Evt('click',{target:menu.children[0]}));assert.equal(menu.children[0].href,'https://example.com/extra');assert.equal(menu.hidden,true);
  h.get('edit-button').click();assert.equal(h.get('courses').children[0].querySelector('.course-links').children.length,3);assert.equal(h.doc.querySelector('.editing-controls'),undefined);
  assert.equal(h.get('courses').children[0].querySelector('.course-more').hidden,false);assert.equal(h.doc.querySelectorAll('.sort-handle').length,0);
  const fallback=fixture(config, {popover:false});
  fallback.doc.querySelector('.course-more').click();
  const fallbackMenu=fallback.get('course-more-'+course.id);assert.equal(fallbackMenu.parentElement,fallback.doc.body);
  fallbackMenu.dispatchEvent(new Evt('keydown',{key:'Escape'}));assert.equal(fallbackMenu.hidden,true);
  // A select fallback inside a modal must stay inside that dialog; body outside it is inert.
  const wrap=fallback.doc.createElement('div');
  const select=fallback.ctx.window.HomeUI.select({id:'fallback-modal-select',label:'选择',options:[['a','一'],['b','二']],value:'a',icon:fallback.ctx.window.HomeIcons.create});
  wrap.append(select.element);fallback.get('editor').append(wrap);fallback.get('editor').showModal();fallback.get('fallback-modal-select-button').click();
  assert.equal(fallback.get('fallback-modal-select-options').parentElement,fallback.get('editor'));
  fallback.get('fallback-modal-select-options').children[1].click();assert.equal(fallback.get('fallback-modal-select-options').parentElement,select.element);
  assert.equal(fallback.get('fallback-modal-select').value,'b');
});
test('course and entry content retain native scrolling with no nested drag bindings', () => {
 const h=fixture();h.get('edit-button').click();h.measure();
 const scroller=h.get('courses').closest('.module-scroll'), before=h.writes.length;
 assert.equal(h.get('courses').querySelector('.sort-handle'),undefined);
 scroller.scrollTop=75;scroller.dispatchEvent(new Evt('scroll'));assert.equal(scroller.scrollTop,75);
 assert.equal(h.writes.length,before);assert.equal(h.ctx.window.frame,undefined);
});
test('Reader keeps three newest items in a single column and preserves scroll on metadata refresh, without creating observers/timers per render', async () => {
  const h=fixture(), scroller=h.get('reader-items').closest('.module-scroll');
  let id=0, timers=new Map, intervals=new Map, calls=0;
  h.ctx.setTimeout=(fn,ms)=>{timers.set(++id,{fn,ms});return id};h.ctx.clearTimeout=i=>timers.delete(i);
  h.ctx.setInterval=(fn,ms)=>{intervals.set(++id,{fn,ms});return id};h.ctx.clearInterval=i=>intervals.delete(i);
  const items=[1,3,2].map(n=>({id:String(n),title:'长标题 '.repeat(30)+n,source:'长来源 '.repeat(15),savedAt:Date.now()+n,url:'https://read.readwise.io/read/'+n}));
  h.ctx.fetch=async()=>{calls++;return {status:200,ok:true,headers:new Headers(),json:async()=>({version:calls,initialized:true,connected:true,webhookConfigured:true,items})}};
  h.run(root+'/src/frontend/reader.js');
  const list=h.get('reader-items'), replace=list.replaceChildren.bind(list);list.replaceChildren=(...nodes)=>{scroller.scrollTop=0;replace(...nodes)};
  scroller.scrollTop=125;scroller.dispatchEvent(new Evt('scroll'));
  async function resume() {for(const[i,t]of [...timers])if(t.ms===80){timers.delete(i);t.fn()}for(let i=0;i<20;i++)await Promise.resolve()}
  const observerCount=h.observers.length;await resume();
  assert.equal(scroller.scrollTop,125);assert.equal(list.children.length,3);assert.deepEqual(list.children.map(row=>row.querySelector('.reader-article').href.split('/').at(-1)),['3','2','1']);
  assert.equal(h.get('module-panel-reading').style['--card-columns'],'1');assert.equal(intervals.size,1);assert.equal(h.observers.length,observerCount);
  assert(list.children[0].querySelector('.reader-article-title').title.includes('长标题'));assert(list.children[0].querySelector('.reader-source').title.includes('长来源'));
  h.ctx.window.dispatchEvent(new Evt('focus'));await resume();assert.equal(calls,2);assert.equal(scroller.scrollTop,125);assert.equal(h.observers.length,observerCount);assert.equal(intervals.size,1);
  h.get('edit-button').click();assert.equal(calls,2);assert.equal(scroller.scrollTop,125);
});

test('roomier courses and learning group gaps stay scoped, fit the unchanged four-row source budget and preserve saved spans', () => {
  const css=fs.readFileSync(root+'/src/frontend/style.css','utf8');
  assert(css.includes('--course-card-height:132px'));assert(css.includes('--course-padding:16px'));
  assert(css.includes('--course-title-gap:20px'));assert(css.includes('--course-button-height:32px'));assert(css.includes('--course-button-gap:7px'));
  assert(css.includes('--course-title-height:44px'));assert(css.includes('line-height:22px'));assert(css.includes('-webkit-line-clamp:2'));
  assert(css.includes('--learning-title-to-content-gap:20px'));assert(css.includes('--learning-tools-to-courses-gap:22px'));assert(css.includes('--learning-toolbar-to-grid-gap:12px'));assert(css.includes('--module-title-gap:calc(var(--learning-title-to-content-gap) - var(--module-focus-inset))'));assert(css.includes('--module-content-gap:8px'));
  assert(css.includes('--entry-height:44px'));assert(css.includes('--reader-row-height:52px'));assert(css.includes('--card-min-width:248px'));
  assert(css.includes('.course-toolbar{display:flex;align-items:center;'));assert(css.includes('height:var(--course-button-height);flex-shrink:0;align-items:center'));assert(!/\.course-links\{[^}]*margin-top:auto/.test(css));
  const h=fixture(), saved=copy(h.config()), writes=h.writes.length;
  const chrome=2+16*2+32+(20-4)+4*2, oneRow=44+22+32+12+132;
  assert.equal(chrome+oneRow,332);assert.equal(h.ctx.window.HomeModel.moduleHeight(4)-(chrome+oneRow),4);
  assert(chrome+oneRow<=h.ctx.window.HomeModel.moduleHeight(4));
  const inner=132-2-16*2;assert(inner>=44+20+32);assert.equal(inner-(44+20+32),2);
  const button=(248-2-16*2-7*2)/3;assert(button>=14+4+28+2*4+2);
  for(const width of [260,507,508,780,1056]){
    const count=h.ctx.window.HomeModuleLayout.columnsFor(width,248);
    assert.equal(count,Math.max(1,Math.min(4,Math.floor((width+12+.5)/260))));
  }
  h.get('edit-button').click();assert.equal(h.doc.querySelector('.sort-handle'),undefined);assert.equal(h.doc.querySelector('.editing-controls'),undefined);
  h.get('finish-editing').click();assert.deepEqual(h.config(),saved);assert.equal(h.writes.length,writes);
  assert.equal(h.doc.documentElement.style['--module-row-height'],'72px');assert.equal(h.doc.documentElement.style['--module-gap'],'16px');
});

test('typographic hierarchy is scoped and course action borders preserve geometry and exceptional states', () => {
 const css=fs.readFileSync(root+'/src/frontend/style.css','utf8');
 assert(css.includes('--module-title-weight:600;--course-title-weight:600;--entry-label-weight:500'));
 assert(css.includes('.section-heading h2{font-weight:var(--module-title-weight)'));
 assert(css.includes('.course-title{font-size:1rem;font-weight:var(--course-title-weight);line-height:22px'));
 assert(css.includes('.entry-title{font-size:.875rem;font-weight:var(--entry-label-weight)'));
 assert(css.includes('.course-link{--course-action-border:transparent;font-weight:var(--entry-label-weight)'));
 assert(css.includes('.course-link.missing{--course-action-border:var(--line);border-style:dashed}'));
 assert(css.includes('.course-link:disabled{--course-action-border:var(--line);opacity:.45;cursor:default}'));
 assert(css.includes('border:1px solid transparent;border-radius:8px'));
 assert(css.includes('border-color:var(--course-action-border,rgb(var(--main-ink-rgb) / .25))'));
 assert(css.includes('outline:var(--focus-width,3px) solid var(--text)'));
 assert(css.includes('background:rgb(var(--main-ink-rgb) / .08)'));assert(css.includes('background:rgb(var(--main-ink-rgb) / .14)'));
 assert(css.includes('.brand{font-size:2.25rem;font-weight:600'));
 assert(css.includes('.reader-article-title{display:block'));assert(css.includes('font-weight:600;line-height:18px'));
 assert(css.includes('.field label{font-size:14px;font-weight:500}'));
 assert(css.includes('.count{font-size:.8125rem;font-weight:400;color:var(--muted)}'));
});
