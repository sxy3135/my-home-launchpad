const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'../..');
const json=x=>JSON.parse(JSON.stringify(x));
class Evt{constructor(type,props={}){this.type=type;Object.assign(this,props)}preventDefault(){this.defaultPrevented=true}stopPropagation(){}stopImmediatePropagation(){this.stopped=true}}
function harness(){
 let doc;class El{
  constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.dataset=new Proxy({},{set:(obj,key,value)=>{obj[key]=String(value);this.attrs["data-"+key.replace(/[A-Z]/g,c=>"-"+c.toLowerCase())]=String(value);return true}});this.style={setProperty(k,v){this[k]=String(v)},getPropertyValue(k){return this[k]||''}};this.scrollTop=0;this.clientHeight=0;this.clientWidth=0;this.scrollHeight=0;this.offsetWidth=0;this.handlers={};this.className='';this.hidden=false;this.value='';this._text='';this.open=false;this.classList={add:v=>this.setClass(v,true),remove:v=>this.setClass(v,false),contains:v=>this.className.split(' ').includes(v),toggle:(v,on)=>this.setClass(v,on===undefined?!this.className.split(' ').includes(v):on)}}
  setClass(v,on){const s=new Set(this.className.split(' ').filter(Boolean));on?s.add(v):s.delete(v);this.className=[...s].join(' ')}
  set textContent(v){this._text=String(v);this.children=[]}get textContent(){return this._text+this.children.map(x=>x.textContent||'').join('')}
  set innerHTML(v){this._html=v;this.children=[];if(v.includes('<svg'))this.append(new El('svg'))}get innerHTML(){return this._html||''}
  get childNodes(){return this.children}get parentElement(){return this.parent}
  append(...vals){for(let v of vals){if(typeof v==='string')v=Object.assign(new El('#text'),{_text:v});if(v.parent)v.remove();this.children.push(v);v.parent=this}}
  get lastElementChild(){return this.children.at(-1)}
  insertBefore(v,b){v.remove();const i=this.children.indexOf(b);this.children.splice(i<0?this.children.length:i,0,v);v.parent=this}
  prepend(v){this.insertBefore(v,this.children[0])}
  querySelectorAll(q){return walk(this).filter(e=>matches(e,q))}
  querySelector(q){return this.querySelectorAll(q)[0]}
  closest(q){for(let e=this;e;e=e.parent)if(matches(e,q))return e;return null}
  setPointerCapture(id){this.capture=id}hasPointerCapture(id){return this.capture===id}releasePointerCapture(){this.capture=null}
  replaceChildren(...vals){this.children.forEach(x=>x.parent=null);this.children=[];this._text='';this.append(...vals)}
  remove(){if(this.parent){this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null}}
  replaceWith(v){const p=this.parent,i=p.children.indexOf(this);p.children[i]=v;v.parent=p;this.parent=null}
  setAttribute(k,v){this.attrs[k]=String(v);if(k==='id')this.id=String(v);if(k==='class')this.className=String(v);if(k.startsWith('data-'))this.dataset[k.slice(5)]=String(v)}
  getAttribute(k){return this.attrs[k]}removeAttribute(k){delete this.attrs[k]}
  addEventListener(k,f){(this.handlers[k]??=[]).push(f)}removeEventListener(k,f){this.handlers[k]=(this.handlers[k]||[]).filter(x=>x!==f)}
  dispatchEvent(e){e.target??=this;for(const f of this.handlers[e.type]||[])f(e);this['on'+e.type]?.(e);return true}
  click(){this.dispatchEvent(new Evt('click'))}focus(){doc.activeElement=this}
  contains(t){return this===t||this.children.some(x=>x.contains(t))}
  showModal(){this.open=true}close(){this.open=false}
  showPopover(){this.popover=true}hidePopover(){this.popover=false}matches(x){return x===':popover-open'&&this.popover}
  getBoundingClientRect(){return this.rect||{left:100,right:280,top:100,bottom:136,width:180,height:36}}scrollIntoView(){}
  cloneNode(deep){const e=new El(this.tag);for(const k of ['className','_text','_html','value'])e[k]=this[k];e.dataset={...this.dataset};e.attrs={...this.attrs};if(deep)for(const child of this.children)e.append(child.cloneNode(true));return e}
 }
 const walk=e=>[e,...e.children.flatMap(walk)];const matches=(e,q)=>{if(q.startsWith('.'))return e.className.split(' ').includes(q.slice(1));const m=/^([a-z-]+)?(?:\[([\w-]+)(?:="([^"]*)")?\])?$/.exec(q);return !!m&&(!m[1]||e.tag===m[1])&&(!m[2]||(m[2]==='id'?!!e.id:e.getAttribute(m[2])!==undefined)&&(m[3]===undefined||e.getAttribute(m[2])===m[3]))};doc=new El('document');doc.createElement=t=>new El(t);doc.createTextNode=t=>Object.assign(new El('#text'),{_text:t});
 doc.getElementById=id=>walk(doc).find(e=>e.id===id);doc.querySelectorAll=q=>walk(doc).filter(e=>matches(e,q));doc.querySelector=q=>doc.querySelectorAll(q)[0];doc.hidden=false;doc.readyState='loading';
 const stack=[doc],voids=['meta','link','input','br','img','hr'];for(const match of fs.readFileSync(root+'/src/home.html','utf8').matchAll(/<\/?([a-z][a-z0-9-]*)([^>]*)>/g)){
  const [all,tag,attrs]=match;if(all.startsWith('</')){stack.pop();continue}const e=new El(tag);for(const a of attrs.matchAll(/([\w-]+)="([^"]*)"/g))e.setAttribute(a[1],a[2]);if(/\bhidden\b/.test(attrs))e.hidden=true;stack.at(-1).append(e);if(tag==='body')doc.body=e;if(tag==='html'){doc.documentElement=e;e.style.setProperty=(k,v)=>{e.style[k]=v}}if(!voids.includes(tag)&&!all.endsWith('/>'))stack.push(e);
 }
 const window=new El('window');window.document=doc;window.innerWidth=1440;window.innerHeight=900;window.navigator={platform:'Win32',userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',maxTouchPoints:0};window.HomeDevice={unlocked:true};const store=new Map([['my-home-launchpad.config.v1',JSON.stringify(require('./config.json').config)]]),writes=[];
 window.requestAnimationFrame=f=>{window.frame=f;return 1};window.cancelAnimationFrame=()=>{window.frame=null};window.scrollBy=o=>{window.scroll=(window.scroll||0)+o.top};window.open=(url,target)=>{(window.opened??=[]).push([url,target]);return {opener:{},location:{replace:u=>window.opened.at(-1)[0]=u}}};
 const ctx={window,document:doc,URL,URLSearchParams,Response,Request,Blob,Intl,Date,crypto:require('node:crypto').webcrypto,Event:Evt,AbortController,FormData:class{constructor(form){this.entries=walk(form).filter(e=>e.tag==='input'&&e.name&&(e.type!=='radio'||e.checked)).map(e=>[e.name,e.value])}[Symbol.iterator](){return this.entries[Symbol.iterator]()}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>{store.set(k,v);writes.push([k,v])},removeItem:k=>{store.delete(k);writes.push([k,null])}},setTimeout:()=>1,clearTimeout:()=>{},setInterval:()=>1,fetch:async()=>({ok:true,json:async()=>({})})};
 vm.createContext(ctx);return {ctx,doc,walk,store,writes,run:file=>{const result=vm.runInContext(fs.readFileSync(file,'utf8'),ctx);if(file.endsWith('/model.js'))store.set('my-home-launchpad.config.v1',JSON.stringify(window.HomeModel.restoreConfig(require('./config.json').config)));return result}};
}


module.exports={harness,Evt,root};
