const {test}=require('node:test'),assert=require('node:assert/strict');
const {messages,languages,resolveLocale,translate,localizeError}=require('../app/locales.js');
test('every supported language covers all UI, dialog and validation messages',()=>{
  const keys=Object.keys(messages['en-GB']).sort();
  for(const locale of Object.keys(languages)){
    assert.deepEqual(Object.keys(messages[locale]).sort(),keys,locale);
    for(const key of keys){assert.ok(messages[locale][key].trim(),`${locale}:${key}`);assert.deepEqual(messages[locale][key].match(/\{\w+\}/g)?.sort(),messages['en-GB'][key].match(/\{\w+\}/g)?.sort(),`${locale}:${key}`);}
  }
});
test('locale matching separates simplified and traditional Chinese and defaults to UK English',()=>{
  for(const value of ['zh-TW','zh-HK','zh-Hant-TW'])assert.equal(resolveLocale(value),'zh-Hant');
  for(const value of ['zh-CN','zh-SG','zh-Hans'])assert.equal(resolveLocale(value),'zh-Hans');
  assert.equal(resolveLocale('es-MX'),'es');assert.equal(resolveLocale('fr-CA'),'fr');assert.equal(resolveLocale('en-US'),'en-GB');
});
test('errors and placeholders use the selected language without disclosing filesystem details',()=>{
  assert.equal(translate('fr','chooseNamed',{name:'Miso'}),'Choisir Miso');
  assert.equal(localizeError('ja',new Error('The pet contains an unsafe file path.')),messages.ja.unsafePath);
  assert.equal(localizeError('zh-Hans',new Error('This pet needs a 1536 × 2288 sprite sheet (8 × 11 frames).')),translate('zh-Hans','imageDimensions',{height:2288,rows:11}));
  assert.equal(localizeError('es',Object.assign(new Error('secret/path'),{code:'ENOENT'})),messages.es.fileError);
});
