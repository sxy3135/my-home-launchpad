// Shared UI actions for controller tests.
const {Evt}=require('./dom.cjs');
const get=(h,id)=>h.doc.getElementById(id);
function moduleAction(h,id,label){
 const panel=get(h,'module-panel-'+id);
 if(label==='编辑'){const title=panel.querySelector('.module-title-edit');title.focus();return title.click()}
 if(label==='删除'){moduleAction(h,id,'编辑');return get(h,'editor-delete').click()}
 panel.querySelector('.course-more-wrap').querySelector('button').click();
 const menu=get(h,'module-menu-'+id);
 const item=menu.querySelectorAll('button').find(b=>b.getAttribute('aria-label')===label);
 if(!item)throw Error('Missing module action: '+label);item.click();
}
function chooseEntry(h,index){get(h,'editor-fields').querySelectorAll('.draft-entry-select')[index].click()}
function discard(h){get(h,'cancel-dialog').click();get(h,'editor-confirm-yes')?.click()}
module.exports={moduleAction,chooseEntry,discard};
