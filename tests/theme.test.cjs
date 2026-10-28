const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {harness,Evt,root}=require('./fixtures/dom.cjs');
function themeFixture(saved=null){const values=new Map(),store=new Map(saved?[['myhome.appearance.v1',saved]]:[]);let writes=0;const ctx={Date,document:{documentElement:{style:{setProperty:(k,v)=>values.set(k,v)}}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>{writes++;store.set(k,v)},removeItem:k=>{writes++;store.delete(k)}}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(root+'/src/frontend/theme.js','utf8'),ctx);return {t:ctx.HomeTheme,values,store,writes:()=>writes}}
const copy=x=>JSON.parse(JSON.stringify(x));
test('smoothstep RGB nodes and midnight continuity, with device-local hours',()=>{
 const {t}=themeFixture();for(const [minute,color] of [[0,'#3B5148'],[360,'#3B5148'],[540,'#E5EEE8'],[1020,'#E5EEE8'],[1080,'#CBDCD1'],[1140,'#8FA99A'],[1260,'#3B5148'],[1440,'#3B5148']])assert.equal(t.hex(t.colorAt(minute)),color);
 assert.deepEqual(copy(t.colorAt(450)),[144,160,152]);assert.equal(t.hex(t.colorAt(1439.99)),t.hex(t.colorAt(0)));
 for(const point of [360,540,1020,1080,1140,1260])assert.equal(t.hex(t.colorAt(point-.001)),t.hex(t.colorAt(point+.001)));
 assert.equal(t.minuteNow({getHours:()=>23,getMinutes:()=>59,getSeconds:()=>30,getMilliseconds:()=>0}),1439.5);
});
test('every minute and intermediate tone meets 4.5:1 for static, 8% and 14% overlays',()=>{
 const {t}=themeFixture();let worst=100;
 for(let minute=0;minute<1440;minute+=.1){const base=t.colorAt(minute);for(const alpha of [0,.08,.14]){const bg=t.mix(base,t.ink(base),alpha),fore=t.ink(bg),a=t.luminance(bg),b=t.luminance(fore),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);assert(ratio>=4.5,`${minute} / ${alpha}: ${ratio}`);worst=Math.min(worst,ratio)}}
 assert.deepEqual(copy(t.ink([100,120,110])),[255,255,255]);assert.deepEqual(copy(t.ink([120,140,130])),[3,6,4]);console.log('Minimum static/overlay contrast:',worst.toFixed(3)+':1');
});
test('preview is temporary; fixed color reloads independently from configuration and automatic restores time',()=>{
 const f=themeFixture(),{t}=f;t.previewAt(1260);assert.equal(f.values.get('--main-color'),'#3B5148');assert.equal(f.writes(),0);t.endPreview();assert.equal(t.fixed,null);
 t.pin(1140);assert.equal(f.values.get('--main-color'),'#8FA99A');t.update({getHours:()=>12,getMinutes:()=>0,getSeconds:()=>0,getMilliseconds:()=>0});assert.equal(f.values.get('--main-color'),'#8FA99A');
 const reload=themeFixture(f.store.get('myhome.appearance.v1'));assert.equal(reload.t.fixed,1140);reload.t.automatic();assert.equal(reload.store.has('myhome.appearance.v1'),false);assert.equal(themeFixture('{"minute":1440}').t.fixed,null);
});
test('one shared minute timer pauses hidden, resumes immediately and survives page restoration without fetch',()=>{
 const h=harness(),f=themeFixture(),timers=new Map();let id=0,now=Date.parse('2026-10-08T16:06:27+08:00'),calls=0;h.ctx.window.HomeTheme={update:()=>calls++};
 h.ctx.Date=class extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}};h.ctx.setTimeout=(fn,ms)=>{timers.set(++id,{fn,ms});return id};h.ctx.clearTimeout=i=>timers.delete(i);h.ctx.fetch=()=>{throw Error('Unexpected network')};h.run(root+'/src/frontend/clock.js');
 assert.equal(timers.size,1);assert.equal([...timers.values()][0].ms,33000);h.doc.hidden=true;h.doc.dispatchEvent(new Evt('visibilitychange'));assert.equal(timers.size,0);
 const paused=calls;now+=3600000;h.doc.hidden=false;h.doc.dispatchEvent(new Evt('visibilitychange'));assert.equal(calls,paused+1);assert.equal(timers.size,1);
 h.ctx.window.dispatchEvent(new Evt('pagehide'));assert.equal(timers.size,0);h.ctx.window.dispatchEvent(new Evt('pageshow'));assert.equal(timers.size,1);
});
test('clock bootstrap updates secondary-page colors without home DOM, respects device locking and pauses its shared timer',()=>{
 for(const unlocked of [false,true]){
  const h=harness(),timers=new Map();let id=0,now=Date.parse('2026-10-11T12:00:27Z'),updates=0;
  for(const name of ['home-clock','home-date'])h.doc.getElementById(name).remove();
  h.ctx.window.HomeDevice.unlocked=unlocked;
  h.ctx.Date=class extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}};
  h.ctx.setTimeout=(fn,ms)=>{timers.set(++id,{fn,ms});return id};h.ctx.clearTimeout=i=>timers.delete(i);
  h.ctx.fetch=()=>{throw Error('Unexpected network')};h.run(root+'/src/frontend/theme.js');
  const theme=h.ctx.window.HomeTheme,update=theme.update.bind(theme);theme.update=date=>{updates++;update(date)};
  h.run(root+'/src/frontend/clock.js');
  assert.equal(h.doc.documentElement.style['--main-color'],theme.hex(theme.colorAt(theme.minuteNow(new h.ctx.Date))));
  assert.equal(timers.size,unlocked?1:0);
  h.doc.hidden=true;h.doc.dispatchEvent(new Evt('visibilitychange'));assert.equal(timers.size,0);
  const paused=updates;now+=9*3600000;h.doc.hidden=false;h.doc.dispatchEvent(new Evt('visibilitychange'));
  assert.equal(updates,paused+(unlocked?1:0));assert.equal(timers.size,unlocked?1:0);
  if(unlocked)assert.equal(h.doc.documentElement.style['--main-color'],theme.hex(theme.colorAt(theme.minuteNow(new h.ctx.Date))));
 }
});
