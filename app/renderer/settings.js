import {PetSprite, ANIMATIONS, availableAnimations} from './sprite.js';
const $=id=>document.getElementById(id);
const api=window.pedex;
const {languages,translate}=globalThis.PetexI18n;
const t=(key,values)=>translate(state?.locale||'en-GB',key,values);
function localize() {
 document.documentElement.lang=state.locale;
 for(const node of document.querySelectorAll('[data-i18n]'))node.textContent=t(node.dataset.i18n);
 for(const node of document.querySelectorAll('[data-i18n-aria]'))node.setAttribute('aria-label',t(node.dataset.i18nAria));
 for(const node of document.querySelectorAll('[data-i18n-title]'))node.title=t(node.dataset.i18nTitle);
 for(const node of document.querySelectorAll('[data-i18n-placeholder]'))node.placeholder=t(node.dataset.i18nPlaceholder);
 $('language').replaceChildren(...Object.entries({auto:t('automatic'),...languages}).map(([value,text])=>{const option=document.createElement('option');option.value=value;option.textContent=text;return option;}));
}
const hero=new PetSprite($('hero-pet'));
let state, cards=[], collectionKey='', toastTimer, actionTimer, busy=false;
function toast(message,error=false) {clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.toggle('error',error);$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,error?8000:4200);}
async function run(action) {try{return await action();}catch(error){toast(error.message,true);return null;}}
async function update(patch) {return run(()=>api.updateSettings(patch));}
function playAnimation() {const name=$('animation').value;if(!state.settings.motion)return;hero.action(name);clearTimeout(actionTimer);actionTimer=setTimeout(()=>hero.action('idle'),ANIMATIONS[name].durations.reduce((a,b)=>a+b,0));run(()=>api.playAnimation(name));}
function render(next) {
  state=next;localize();
  const {settings,pets}=state;
  $('discover').hidden=state.codexImports===false;
  $('import-builtins').hidden=state.codexImports===false;
  const pet=pets.find(p=>p.id===settings.petId)||pets[0];
  hero.setPet(pet).catch(()=>toast(t('imageDecode'),true));
  hero.active=state.screenAwake;hero.motion=settings.motion;
  $('pet-name').textContent=pet.displayName;
  $('delete-pet').hidden=!!pet.builtin;$('export-pet').hidden=!!pet.builtin;$('backup').disabled=pets.length<2;
  const animations=availableAnimations(pet);
  if($('animation').dataset.petId!==pet.id+'|'+state.locale){
    $('animation').dataset.petId=pet.id+'|'+state.locale;
    $('animation').replaceChildren(...animations.map(name=>{const option=document.createElement('option');option.value=name;option.textContent=t(({waving:'wave',jumping:'jump',failed:'sad',waiting:'wait',running:'work',review:'look','running-left':'left','running-right':'right'})[name]);return option;}));
    clearTimeout(actionTimer);hero.action('idle');
  }
  $('play').disabled=!settings.motion;
  $('animation').disabled=!settings.motion;
  $('presence').textContent=t(!state.screenAwake?'sleeping':!settings.visible?'hidden':state.fullscreenHidden&&settings.hideFullscreen?'fullscreenHidden':!settings.motion?'paused':'visible');
  $('pet-count').textContent=pets.length;
  $('size').value=settings.size;
  $('size-description').textContent=`${settings.size} px`;
  for(const key of ['alwaysOnTop','motion','followCursor','launchAtLogin','visible','hideFullscreen','snapEdges','shortcut'])$(key).checked=settings[key];
  $('launchAtLogin').disabled=!state.loginAvailable;
  $('login-description').hidden=state.loginAvailable;
  $('login-description').textContent=t('installedOnly');
  $('behaviour').value=settings.behaviour;$('behaviour').disabled=!settings.motion;
  $('language').value=settings.language;
  $('hideFullscreen').disabled=!state.fullscreenAvailable;
  $('fullscreen-description').hidden=state.fullscreenAvailable;$('fullscreen-description').textContent=t('fullscreenUnavailable');
  $('shortcut-description').textContent=state.shortcutAvailable||!settings.shortcut?(state.platform==='darwin'?'⌘⇧P':'Ctrl+Shift+P'):t('shortcutBusy');
  $('followCursor').disabled=!settings.motion||(!pet.builtin&&pet.spriteVersionNumber<2);
  $('gaze-description').hidden=pet.builtin||pet.spriteVersionNumber>=2;
  $('gaze-description').textContent=t('unsupportedGaze');
  const key=JSON.stringify([state.locale,pets.map(p=>[p.id,p.displayName])]);
  if(key!==collectionKey){
    collectionKey=key;cards.forEach(c=>c.sprite.stop());cards=[];$('pet-list').replaceChildren();
    for(const p of pets){
      const button=document.createElement('button');button.className='pet-card';button.dataset.petId=p.id;button.setAttribute('aria-label',t('chooseNamed',{name:p.displayName}));
      const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');
      const name=document.createElement('span');name.className='pet-name';name.textContent=p.displayName;
      const tick=document.createElement('span');tick.className='selected-tick';tick.textContent='✓';tick.setAttribute('aria-hidden','true');
      button.append(canvas,name,tick);
      button.addEventListener('click',()=>update({petId:p.id,visible:true}));
      if(!p.builtin){
        button.title=t('removeHint',{name:p.displayName});
        button.addEventListener('contextmenu',event=>{event.preventDefault();run(()=>api.removePet(p.id));});
        button.addEventListener('keydown',event=>{if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();run(()=>api.removePet(p.id));}});
      }
      const sprite=new PetSprite(canvas);sprite.motion=false;sprite.active=state.screenAwake;sprite.setPet(p).catch(()=>{name.textContent=t('unreadable');});cards.push({button,sprite,tick});$('pet-list').append(button);
    }
    const add=document.createElement('button');add.className='pet-card add-card';add.setAttribute('aria-label',t('importFolderLabel'));
    const plus=document.createElement('span');plus.textContent='+';const label=document.createElement('span');label.className='pet-name';label.textContent=t('importFolder');add.append(plus,label);add.onclick=()=>importPets('folder');$('pet-list').append(add);
  }
  for(const card of cards){card.sprite.active=state.screenAwake;const selected=card.button.dataset.petId===settings.petId;card.button.classList.toggle('selected',selected);card.button.setAttribute('aria-pressed',String(selected));card.tick.hidden=!selected;}
  renderExtras();filterPets();
}
function importMessage(results){
  if(!results?.length)return;
  const failures=results.filter(r=>r.error);const added=results.filter(r=>r.pet&&!r.duplicate).length;const duplicates=results.filter(r=>r.duplicate).length;
  if(failures.length)toast(`${added?t('added',{count:added}):''}${failures[0].source}: ${failures[0].error}`,true);
  else if(added)toast(t('imported',{count:added}));
  else if(duplicates)toast(t('duplicate'));
}
async function importPets(kind){if(busy)return;busy=true;try{importMessage(await run(()=>api.importPet(kind)));}finally{busy=false;}}
async function exportPets(kind){if(busy)return;busy=true;try{if(await run(()=>api.exportPets(kind)))toast(t('exported'));}finally{busy=false;}}
$('export-pet').onclick=()=>exportPets('pet');$('backup').onclick=()=>exportPets('library');
$('behaviour').onchange=()=>update({behaviour:$('behaviour').value});$('language').onchange=()=>update({language:$('language').value});
$('delete-pet').onclick=()=>run(()=>api.removePet(state.settings.petId));
$('import-builtins').onclick=async()=>{if(busy)return;busy=true;$('import-builtins').disabled=true;try{importMessage(await run(()=>api.importBuiltins()));}finally{busy=false;$('import-builtins').disabled=false;}};
$('import-file').onclick=()=>importPets('file');
$('discover').onclick=async()=>{
  if(busy)return;busy=true;$('discover').disabled=true;
  try{const result=await run(()=>api.discoverPets());if(result){if(!result.found)toast(t('noCustom'));else importMessage(result.results);}}
  finally{busy=false;$('discover').disabled=false;}
};
$('play').onclick=playAnimation;$('hero-pet').onclick=playAnimation;
$('hero-pet').addEventListener('mousemove',event=>{if(state?.settings.followCursor){const rect=$('hero-pet').getBoundingClientRect();hero.gaze={x:(event.clientX-rect.x-rect.width/2)*3,y:(event.clientY-rect.y-rect.height/2)*3};}});
$('hero-pet').addEventListener('mouseleave',()=>hero.gaze=null);
for(const key of ['alwaysOnTop','motion','followCursor','launchAtLogin','visible','hideFullscreen','snapEdges','shortcut'])$(key).onchange=async()=>{const result=await update({[key]:$(key).checked});if(!result&&state)render(state);};
$('size').addEventListener('input',()=>{const size=Number($('size').value);$('size-description').textContent=`${size} px`;});
$('size').addEventListener('change',()=>update({size:Number($('size').value)}));
$('home').onclick=async()=>{if(await run(async()=>{await api.home();return true;}))toast(t('resetDone'));};
$('github').onclick=event=>{event.preventDefault();run(()=>api.openRepository());};
$('open-folder').onclick=()=>run(()=>api.openPetsFolder());
$('done').onclick=()=>run(()=>api.closeSettings());
let depth=0;
window.addEventListener('dragenter',event=>{event.preventDefault();if(event.dataTransfer.types.includes('Files')){depth++;$('drop-overlay').hidden=false;}});
window.addEventListener('dragover',event=>{event.preventDefault();event.dataTransfer.dropEffect='copy';});
window.addEventListener('dragleave',event=>{event.preventDefault();if(--depth<=0){depth=0;$('drop-overlay').hidden=true;}});
window.addEventListener('drop',async event=>{event.preventDefault();depth=0;$('drop-overlay').hidden=true;if(busy)return;busy=true;try{importMessage(await run(()=>api.importDropped(event.dataTransfer.files)));}finally{busy=false;}});
api.onState(render);
run(async()=>render(await api.getState()));

const featureKeys=['multiPet','interactions','personalities','roaming','toys','petting','routines','layouts','libraryTools'];
let companionKey='',displayKey='',layoutKey='';
function options(select,entries){select.replaceChildren(...entries.map(([value,label])=>{const option=document.createElement('option');option.value=value;option.textContent=label;return option;}));}
function renderExtras(){
  const {settings,pets}=state,f=settings.features;
  for(const key of featureKeys)$('feature-'+key).checked=f[key];
  for(const [panel,feature] of [['companions-panel','multiPet'],['roaming-panel','roaming'],['toys-panel','toys'],['petting-hint','petting'],['routines-panel','routines'],['layouts-panel','layouts'],['library-tools','libraryTools']])$(panel).hidden=!f[feature];
  $('interact-now').hidden=!f.interactions;$('interact-now').disabled=!settings.motion||state.instances.filter(p=>p.active&&p.behaviour!=='quiet').length<2;
  $('throw-ball').disabled=!settings.motion||!state.instances.some(p=>p.active);
  $('extras-off').disabled=!Object.values(f).some(Boolean);
  const key=JSON.stringify([state.locale,pets.map(p=>[p.id,p.displayName]),settings.petId,settings.primaryVisible,f.personalities,settings.companions.map(c=>[c.id,c.petId,c.size,c.behaviour,c.visible,c.followCursor])]);
  if(key!==companionKey){
    companionKey=key;options($('companion-pet'),pets.map(p=>[p.id,p.displayName]));$('companion-list').replaceChildren();
    const primary=document.createElement('div');primary.className='companion-row';const name=document.createElement('span');name.textContent=pets.find(p=>p.id===settings.petId)?.displayName;const visible=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.checked=settings.primaryVisible;box.id='primary-visible';box.onchange=()=>update({primaryVisible:box.checked});visible.append(box,document.createTextNode(t('showPet')));primary.append(name,visible);$('companion-list').append(primary);
    for(const item of settings.companions){
      const row=document.createElement('div');row.className='companion-row';row.dataset.instanceId=item.id;
      const petSelect=document.createElement('select');petSelect.setAttribute('aria-label',t('choosePet'));options(petSelect,pets.map(p=>[p.id,p.displayName]));petSelect.value=item.petId;petSelect.onchange=()=>run(()=>api.updateCompanion(item.id,{petId:petSelect.value}));row.append(petSelect);
      const visible=document.createElement('label'),checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=item.visible;checkbox.onchange=()=>run(()=>api.updateCompanion(item.id,{visible:checkbox.checked}));visible.append(checkbox,document.createTextNode(t('showPet')));row.append(visible);
      if(f.personalities){
        const size=document.createElement('input');size.type='number';size.min=48;size.max=240;size.step=8;size.value=item.size;size.setAttribute('aria-label',t('size'));size.onchange=()=>run(()=>api.updateCompanion(item.id,{size:Number(size.value)}));row.append(size);
        const behaviour=document.createElement('select');behaviour.setAttribute('aria-label',t('behaviour'));options(behaviour,['quiet','calm','playful'].map(value=>[value,t(value)]));behaviour.value=item.behaviour;behaviour.onchange=()=>run(()=>api.updateCompanion(item.id,{behaviour:behaviour.value}));row.append(behaviour);
        const gaze=document.createElement('label'),gazeBox=document.createElement('input');gazeBox.type='checkbox';gazeBox.checked=item.followCursor;gazeBox.onchange=()=>run(()=>api.updateCompanion(item.id,{followCursor:gazeBox.checked}));gaze.append(gazeBox,document.createTextNode(t('followCursor')));row.append(gaze);
      }
      const remove=document.createElement('button');remove.textContent=t('dismissPet');remove.onclick=()=>run(()=>api.removeCompanion(item.id));row.append(remove);$('companion-list').append(row);
    }
  }
  $('add-companion').disabled=settings.companions.length>=3;$('companion-count').textContent=t('petCount',{count:1+settings.companions.length});
  const dk=JSON.stringify([state.locale,state.displays]);if(dk!==displayKey){displayKey=dk;options($('roam-display'),state.displays.map((d,i)=>[d.id,d.name||t('displayNumber',{number:i+1})]));}
  $('roam-display').value=settings.roamArea?.displayId||state.displays[0]?.id;
  for(const [id,key] of [['routine-start','start'],['routine-end','end'],['routine-idle','idleMinutes']])if(document.activeElement!==$(id))$(id).value=settings.routine[key];
  const lk=JSON.stringify([state.locale,settings.layouts.map(p=>[p.id,p.name])]);if(lk!==layoutKey){layoutKey=lk;options($('layout-select'),settings.layouts.map(p=>[p.id,p.name]));}
  $('restore-layout').disabled=$('remove-layout').disabled=!settings.layouts.length;$('save-layout').disabled=settings.layouts.length>=20;
  $('favourite-pet').setAttribute('aria-pressed',String(settings.favourites.includes(settings.petId)));$('favourite-pet').textContent=t(settings.favourites.includes(settings.petId)?'unfavourite':'favourite');
  if(document.activeElement!==$('rename-pet'))$('rename-pet').value=pets.find(p=>p.id===settings.petId)?.displayName||'';
}
function filterPets(){
  if(!state)return;const enabled=state.settings.features.libraryTools,query=enabled?$('pet-search').value.trim().toLocaleLowerCase():'';
  for(const card of cards){const pet=state.pets.find(p=>p.id===card.button.dataset.petId);card.button.hidden=enabled&&(!pet.displayName.toLocaleLowerCase().includes(query)||($('only-favourites').checked&&!state.settings.favourites.includes(pet.id)));}
}
for(const key of featureKeys)$('feature-'+key).onchange=()=>update({features:{...state.settings.features,[key]:$('feature-'+key).checked}});
$('extras-off').onclick=()=>update({features:Object.fromEntries(featureKeys.map(key=>[key,false]))});
$('add-companion').onclick=()=>run(()=>api.addCompanion($('companion-pet').value));
$('interact-now').onclick=()=>run(()=>api.interact());
$('throw-ball').onclick=()=>run(()=>api.throwBall());
$('draw-area').onclick=()=>run(()=>api.chooseArea());
$('roam-display').onchange=()=>update({roamArea:{displayId:$('roam-display').value,rect:null}});
$('whole-display').onclick=()=>update({roamArea:{displayId:$('roam-display').value,rect:null}});
for(const [id,key] of [['routine-start','start'],['routine-end','end'],['routine-idle','idleMinutes']])$(id).onchange=()=>update({routine:{...state.settings.routine,[key]:Number($(id).value)}});
$('save-layout').onclick=async()=>{if(!$('layout-name').value.trim()){$('layout-name').focus();return;}if(await run(async()=>{await api.saveLayout($('layout-name').value);return true;})){$('layout-name').value='';toast(t('layoutSaved'));}};
$('restore-layout').onclick=()=>run(()=>api.restoreLayout($('layout-select').value));
$('remove-layout').onclick=()=>run(()=>api.removeLayout($('layout-select').value));
$('pet-search').oninput=filterPets;$('only-favourites').onchange=filterPets;
$('favourite-pet').onclick=()=>{const favourites=new Set(state.settings.favourites),id=state.settings.petId;if(favourites.has(id))favourites.delete(id);else favourites.add(id);update({favourites:[...favourites]});};
$('rename-save').onclick=()=>update({petNames:{...state.settings.petNames,[state.settings.petId]:$('rename-pet').value}});
