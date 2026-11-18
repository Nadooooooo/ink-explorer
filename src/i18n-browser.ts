import english from "./locales/en.json";
import metadata from "./locales/meta.json";
export type Locale="en"|"zh"|"hi"|"es"|"fr"|"ar"|"bn"|"pt"|"ru"|"ja";
export const locales=metadata.locales as Locale[];
export const localeNames=metadata.localeNames as Record<Locale,string>;
const catalogues:Partial<Record<Locale,Record<string,string>>>={en:english};
const pending=new Map<Locale,Promise<void>>();
const imports={zh:()=>import("./locales/zh.json"),hi:()=>import("./locales/hi.json"),es:()=>import("./locales/es.json"),fr:()=>import("./locales/fr.json"),ar:()=>import("./locales/ar.json"),bn:()=>import("./locales/bn.json"),pt:()=>import("./locales/pt.json"),ru:()=>import("./locales/ru.json"),ja:()=>import("./locales/ja.json")};
export function isLocale(value:string|null|undefined):value is Locale{return !!value && (locales as string[]).includes(value);}
export function loadLocale(locale:Locale):Promise<void>{
 if(catalogues[locale])return Promise.resolve();
 let promise=pending.get(locale);if(promise)return promise;
 promise=imports[locale as keyof typeof imports]().then(module=>{catalogues[locale]=module.default;}).finally(()=>pending.delete(locale));pending.set(locale,promise);return promise;
}
export function message(locale:Locale,key:string):string{return catalogues[locale]?.[key] ?? (english as Record<string,string>)[key] ?? key;}
export function formatMessage(locale:Locale,key:string,values:Record<string,string|number>):string{return message(locale,key).replace(/\{(\w+)\}/g,(match,name:string)=>name in values?String(values[name]):match);}
export function seoMessages(locale:Locale){return {...english,...catalogues[locale]};}
