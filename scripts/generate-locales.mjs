import{registerHooks}from'node:module';
import{mkdir,writeFile}from'node:fs/promises';
registerHooks({resolve(specifier,context,next){try{return next(specifier,context)}catch(error){if(specifier.startsWith('.')&&!/\.[a-z]+$/.test(specifier))return next(specifier+'.ts',context);throw error;}}});
const{locales,localeNames,catalogueKeys,message}=await import('../src/i18n.ts');
await mkdir('src/locales',{recursive:true});const keys=catalogueKeys();
for(const locale of locales)await writeFile(`src/locales/${locale}.json`,JSON.stringify(Object.fromEntries(keys.map(key=>[key,message(locale,key)]))));
await writeFile('src/locales/meta.json',JSON.stringify({locales,localeNames}));
console.log(`Generated ${keys.length} resolved messages × ${locales.length} locales.`);
