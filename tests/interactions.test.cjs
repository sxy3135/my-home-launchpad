const test=require('node:test'),assert=require('node:assert/strict');
const {harness,root}=require('./fixtures/dom.cjs');
const json=x=>JSON.parse(JSON.stringify(x));
test('launching deduplicates targets, handles blocked popups and repeats, and rejects invalid reorder targets',()=>{
 const h=harness();for(const file of ['model','interactions'])h.run(root+'/src/frontend/'+file+'.js');
 const M=h.ctx.window.HomeModel,I=h.ctx.window.HomeInteractions;
 // Target canonicalization, blank skipping, exact order including future buttons.
 const links=[{name:'blank',url:''},{name:'note',url:'obsidian://open?vault=Example&file=Sample'},{name:'same note',url:'obsidian://open?file=Sample.md&vault=Example'},{name:'folder',url:'C:\\Courses\\course-1-files'},{name:'same folder',url:M.folderUri('C:\\Courses\\course-1-files')},{name:'web',url:'https://EXAMPLE.com:443/a'},{name:'same web',url:'https://example.com/a'},{name:'future',url:'https://example.com/new'}];
 assert.deepEqual(json(M.courseLaunchTargets(links)).map(t=>t.name),['note','folder','web','future']);
 let calls=[],now=0;const browser={open:(u,t)=>{calls.push([u,t]);if(u==='about:blank'&&calls.length===2)return null;return {opener:'unsafe',location:{replace:u=>calls.at(-1)[0]=u}}}};
 const launch=I.createLauncher(browser,()=>now),targets=[{kind:'external',url:'obsidian://open'},{kind:'web',url:'https://a.example/'},{kind:'web',url:'https://b.example/'}];
 assert.deepEqual(json(launch('x',targets)),{web:1,blocked:1,external:1,failed:0});assert.deepEqual(calls,[['obsidian://open','_self'],['about:blank','_blank'],['https://b.example/','_blank']]);assert(launch('x',targets).repeat);now=1800;launch('x',targets);assert.equal(calls.length,6);
 // Geometry and reorder boundary/no-op checks.
 let list=[{id:'a'},{id:'b'},{id:'c'}];assert(M.reorderItem(list,'a',null));assert.deepEqual(list.map(e=>e.id),['b','c','a']);assert(!M.reorderItem(list,'a',null));assert.throws(()=>M.reorderItem(list,'a','unknown'));
});
