const crypto = require('node:crypto');
const FEATURES = Object.freeze(Object.fromEntries(['multiPet','interactions','personalities','roaming','toys','petting','routines','layouts','libraryTools'].map(key=>[key,false])));
const MAX_PETS = 4;
const plain = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const text = (value,max=80) => typeof value === 'string' ? value.trim().slice(0,max) : '';
const number = (value,min,max,fallback) => Number.isFinite(value) ? Math.max(min,Math.min(max,value)) : fallback;
const position = value => Number.isFinite(value?.x)&&Number.isFinite(value?.y) ? {x:Math.round(value.x),y:Math.round(value.y)} : null;
function profile(value={}) {
  return {size:Math.round(number(value.size,48,240,160)),behaviour:['quiet','calm','playful'].includes(value.behaviour)?value.behaviour:'calm',followCursor:value.followCursor!==false};
}
function companions(value) {
  const ids=new Set(['primary']);
  return (Array.isArray(value)?value:[]).slice(0,MAX_PETS-1).filter(p=>p&&typeof p==='object'&&typeof p.petId==='string'&&/^[\w-]{1,80}$/.test(p.id)&&!ids.has(p.id)&&ids.add(p.id)).map(p=>({id:p.id,petId:text(p.petId),...profile(p),visible:p.visible!==false,position:position(p.position)}));
}
function placement(value) {
  return typeof value?.displayId==='string'&&Number.isFinite(value.x)&&Number.isFinite(value.y) ? {displayId:text(value.displayId),x:number(value.x,0,1,0),y:number(value.y,0,1,0)} : null;
}
function roamArea(value) {
  const rect=value?.rect;
  if(typeof value?.displayId!=='string')return null;
  if(!rect)return {displayId:text(value.displayId),rect:null};
  if(!['x','y','width','height'].every(k=>Number.isFinite(rect[k])))return null;
  const x=number(rect.x,0,.95,0),y=number(rect.y,0,.95,0);
  return {displayId:text(value.displayId),rect:{x,y,width:number(rect.width,.05,1-x,1-x),height:number(rect.height,.05,1-y,1-y)}};
}
function normalizeExtras(input={}) {
  const features=plain(input.features),routine=plain(input.routine);
  const petNames=Object.fromEntries(Object.entries(plain(input.petNames)).filter(([id,name])=>/^[\w-]{1,80}$/.test(id)&&text(name)).slice(0,1000).map(([id,name])=>[id,text(name)]));
  const placements=Object.fromEntries(Object.entries(plain(input.placements)).filter(([id,p])=>/^[\w-]{1,80}$/.test(id)&&placement(p)).slice(0,MAX_PETS).map(([id,p])=>[id,placement(p)]));
  const layouts=(Array.isArray(input.layouts)?input.layouts:[]).slice(0,20).filter(p=>p&&text(p.id)&&text(p.name)).map(p=>({id:text(p.id),name:text(p.name,50),primary:{petId:text(p.primary?.petId)||'miso',...profile(p.primary),primaryVisible:p.primary?.primaryVisible!==false,position:position(p.primary?.position)},companions:companions(p.companions),placements:Object.fromEntries(Object.entries(plain(p.placements)).filter(([id,v])=>/^[\w-]{1,80}$/.test(id)&&placement(v)).slice(0,MAX_PETS).map(([id,v])=>[id,placement(v)])),multiPet:p.multiPet===true,personalities:p.personalities===true}));
  return {features:{...FEATURES,...Object.fromEntries(Object.keys(FEATURES).map(k=>[k,features[k]===true]))},primaryVisible:input.primaryVisible!==false,companions:companions(input.companions),roamArea:roamArea(input.roamArea),routine:{start:Math.round(number(routine.start,0,23,22)),end:Math.round(number(routine.end,0,23,7)),idleMinutes:Math.round(number(routine.idleMinutes,1,120,10))},layouts,placements,petNames,favourites:[...new Set((Array.isArray(input.favourites)?input.favourites:[]).filter(id=>typeof id==='string'&&/^[\w-]{1,80}$/.test(id)))].slice(0,1000)};
}
function resting(routine,date,idleSeconds) {
  const hour=date.getHours(),night=routine.start===routine.end?false:routine.start<routine.end?hour>=routine.start&&hour<routine.end:hour>=routine.start||hour<routine.end;
  return night||idleSeconds>=routine.idleMinutes*60;
}
function newCompanion(petId,settings) { return {id:crypto.randomUUID(),petId,...profile(settings),visible:true,position:null}; }
module.exports={FEATURES,MAX_PETS,profile,companions,placement,roamArea,normalizeExtras,resting,newCompanion};
