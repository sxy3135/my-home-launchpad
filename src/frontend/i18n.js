import {normalizeLanguage, translateMessage, translateKnownText, sourceMessage} from '../shared/i18n.mjs';

(function(root){
  'use strict';
  const key='myhome.language.v1',doc=root.document;
  let saved;
  try { saved=root.localStorage.getItem(key); } catch {}
  let language=normalizeLanguage(saved||root.navigator?.language||'zh-CN');
  function apply(scope=doc) {
    if(!scope)return;
    doc.documentElement.lang=language;
    for(const node of scope.querySelectorAll('[data-i18n]')) node.textContent=translateKnownText(node.getAttribute('data-i18n'),language);
    for(const attr of ['aria-label','title','placeholder','alt','content']) {
      for(const node of scope.querySelectorAll('[data-i18n-'+attr+']')) node.setAttribute(attr,translateKnownText(node.getAttribute('data-i18n-'+attr),language));
    }
    for(const select of scope.querySelectorAll('[data-home-language]')) {
      select.value=language;
      if(!select.homeLanguageBound) {
        select.homeLanguageBound=true;
        select.addEventListener('change',()=>setLanguage(select.value));
      }
    }
  }
  function setLanguage(value) {
    const next=normalizeLanguage(value),changed=next!==language;
    language=next;
    try {root.localStorage.setItem(key,language);}catch{}
    try {doc.cookie=key+'='+language+'; Path=/; Max-Age=31536000; SameSite=Lax'+(root.location?.protocol==='https:'?'; Secure':'');}catch{}
    apply();
    for(const id of ['device-status','device-login-error','save-status']) {
      const node=doc.getElementById(id);
      if(node)node.textContent=translateKnownText(sourceMessage(node.textContent),language);
    }
    if(changed) root.dispatchEvent(new (root.CustomEvent||root.Event||Event)('myhome:language',{detail:{language}}));
  }
  root.HomeI18n={get language(){return language;},t:message=>translateMessage(message,language),setLanguage,apply};
  if(doc){apply();doc.addEventListener('DOMContentLoaded',()=>apply());}
})(typeof window==='undefined'?globalThis:window);
