import englishMessages from './messages.json' with {type:'json'};

export function normalizeLanguage(value) {
  return /^zh(?:-|$)/i.test(String(value||'')) ? 'zh-CN' : 'en';
}
export function translateMessage(message, language='zh-CN') {
  return normalizeLanguage(language)==='en' ? (englishMessages[message] ?? message) : message;
}
export function translateKnownText(text, language='zh-CN') {
  if(normalizeLanguage(language)!=='en') return text;
  if(Object.hasOwn(englishMessages,text)) return englishMessages[text];
  // Used only for authored HTML, never for course names, URLs, or Reader content.
  let result=text;
  for(const key of Object.keys(englishMessages).sort((a,b)=>b.length-a.length)) {
    if(/[\u4e00-\u9fff]/.test(key)) result=result.split(key).join(englishMessages[key]);
  }
  return result;
}
const escapeMarkup=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const decodeMarkup=value=>value.replaceAll('&quot;','"').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&#39;',"'").replaceAll('&amp;','&');

export function annotateMarkup(html) {
  return html.replace(/<(script|style|textarea|pre|code|option|title)\b[^>]*>[\s\S]*?<\/\1>|<!--[\s\S]*?-->|<[^>]+>|[^<]+/gi,part=>{
    if(/^<(script|style|textarea|pre|code|option)\b/i.test(part)||part.startsWith('<!--')) return part;
    if(/^<title\b/i.test(part)) return part.replace('<title>','<title data-i18n="'+escapeMarkup(decodeMarkup(part.replace(/<\/?title[^>]*>/g,'')))+'">');
    if(part.startsWith('<')) {
      const additions=[];
      part.replace(/\b(aria-label|title|placeholder|alt|content)="([^"]*)"/g,(_,attr,text)=>{
        if(/[\u4e00-\u9fff]/.test(text)) additions.push(' data-i18n-'+attr+'="'+escapeMarkup(decodeMarkup(text))+'"');
        return _;
      });
      return part.replace(/\s*\/?>(?=$)/,end=>additions.join('')+end);
    }
    const text=decodeMarkup(part.trim());
    if(!/[\u4e00-\u9fff]/.test(text)||text==='My Home 打开资料') return part;
    return part.replace(part.trim(),'<span data-i18n="'+escapeMarkup(text)+'">'+part.trim()+'</span>');
  });
}
export function localizeMarkup(html, language='zh-CN') {
  html=html.replace(/<(span|title)\b([^>]*\bdata-i18n="([^"]*)"[^>]*)>([^<]*)<\/\1>/g,(_,tag,attrs,source)=>
    '<'+tag+attrs+'>'+escapeMarkup(translateKnownText(decodeMarkup(source),language))+'</'+tag+'>');
  return html.replace(/<[^>]+>/g,tag=>{
    for(const match of [...tag.matchAll(/\bdata-i18n-(aria-label|title|placeholder|alt|content)="([^"]*)"/g)]) {
      const value=escapeMarkup(translateKnownText(decodeMarkup(match[2]),language));
      tag=tag.replace(new RegExp('(?<![\\w-])'+match[1]+'="[^"]*"'),match[1]+'="'+value+'"');
    }
    return tag;
  }).replace(/<html\s+lang="[^"]*"/,'<html lang="'+normalizeLanguage(language)+'"');
}
export function requestLanguage(request) {
  const cookie=request.headers.get('cookie')?.match(/(?:^|;\s*)myhome\.language\.v1=(en|zh-CN)(?:;|$)/)?.[1];
  return normalizeLanguage(cookie||request.headers.get('accept-language')?.split(',')[0]||'zh-CN');
}

export function sourceMessage(value) {
  return Object.keys(englishMessages).find(key=>englishMessages[key]===value) || value;
}
