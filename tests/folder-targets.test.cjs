const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),ctx={URL,navigator:{platform:'Win32'},crypto:require('node:crypto').webcrypto};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'src/frontend/model.js'),'utf8'),ctx);
const M=ctx.HomeModel,clone=x=>JSON.parse(JSON.stringify(x));
const config=M.restoreConfig(require("./fixtures/config.json").config);
for(const course of config.semesters[0].courses){
  const stored=course.links.find(l=>l.id===course.id+'-files').folderPaths.windows;
  assert.equal(stored,'C:\\Courses\\'+course.id+'-files');
  const href=M.targetUrl(M.resolveTarget({url:stored}));
  assert.match(href,/^myhome-folder:open\/[A-F0-9]+$/);
  assert.equal(Buffer.from(href.split('open/')[1],'hex').toString('utf8'),stored);
  assert.equal(M.normalizeUrl(href),stored);
}
for(const version of [undefined,1]){
  const old=clone(config);old.localFoldersVersion=version;
  for(const c of old.semesters[0].courses){delete c.links[2].folderPaths;c.links[2].url='https://example.com/'+c.id;}
  old.semesters[0].courses[0].links[1].url='https://chatgpt.com/g/custom-project';
  M.getModule(old,'affairs').links[0].name='Customized mailbox';
  const before=JSON.stringify(old),migrated=M.restoreConfig(old);
  assert.equal(JSON.stringify(old),before);
  assert.equal(migrated.localFoldersVersion,2);
  for(const c of migrated.semesters[0].courses){
    assert.equal(c.links[2].url,'https://example.com/'+c.id);assert.equal(c.links[2].folderPaths,undefined);
  }
  assert.equal(migrated.semesters[0].courses[0].links[1].url,'https://chatgpt.com/g/custom-project');
  assert.equal(M.getModule(migrated,'affairs').links[0].name,'Customized mailbox');
}
const future=clone(config),semester=M.addSemester(future,'Semester 2');
future.semesters[1].courses.push({id:'new-course',code:'',name:'New course',links:[]});
const entry=M.saveShortcut(future,{course:'new-course'},{name:'课程资料',url:'"D:\\Courses\\Semester 2\\课件 (Lecture) & Notes #1"',icon:'folder',position:0});
assert.equal(entry.folderPaths.windows,'D:\\Courses\\Semester 2\\课件 (Lecture) & Notes #1');
assert.equal(Buffer.from(M.targetUrl(M.resolveTarget(entry)).split('open/')[1],'hex').toString('utf8'),entry.folderPaths.windows);
const restored=M.restoreConfig(future);assert.deepEqual(clone(restored),clone(future));
restored.semesters[0].courses[0].links[2].folderPaths.windows='E:\\Changed folder';
assert.equal(M.restoreConfig(restored).semesters[0].courses[0].links[2].folderPaths.windows,'E:\\Changed folder');
M.renameSemester(restored,semester,'Semester 2 updated');
M.removeShortcut(restored,{course:'new-course',id:entry.id});
M.deleteSemester(restored,semester);assert.equal(restored.currentSemester,'semester-1');
assert.throws(()=>M.deleteSemester(restored,'semester-1'));
for(const p of ['C:\\','e:\\Reading\\O\'Brien + 100%','C:\\课件\\test (2) & x#y!']){
  const normalized=M.normalizeLocalPath(p);assert.equal(M.normalizeUrl(M.folderUri(p)),normalized);
}
for(const invalid of ['C:relative','C:\\..\\Windows','C:\\CON','C:\\Foo:stream','C:\\Foo\\..','C:\\Foo\\bar.','C:\\Foo\ncmd','C:\\Foo" --cmd','\\\\server\\share','\\\\?\\C:\\Windows','C:\\Foo\\LPT1.txt','file:///C:/Windows','javascript:alert(1)','myhome-folder://open?path=C%3A%5CFoo&cmd=calc','myhome-folder://open?path=C%3A%5CFoo%FF','myhome-folder://open?path=C%3A%5CFoo#fragment','myhome-folder://open?path=C%3A%5CFoo%','myhome-folder://user@open?path=C%3A%5CFoo','myhome-folder:open/43','myhome-folder:open/433A5CFF','myhome-folder:open/433A5C2E2E5C57696E646F7773','myhome-folder:open/433A5C466F6F&cmd=calc']){
  assert.throws(()=>M.normalizeUrl(invalid),invalid);
}
assert.deepEqual(clone(M.validateConfig(config)),clone(config));
console.log('PASS: seven exact paths, Unicode and special-character links, stored-path restoration, cloud backup, note/GPT preservation, new semester/course/edit/remove/import, later changes retained, unsafe inputs rejected');
