const {test}=require('node:test'),assert=require('node:assert/strict');
const {normalizeSettings}=require('../app/library.cjs');
const {resting}=require('../app/preferences.cjs');
const {freeTarget,overlaps,planInteraction}=require('../app/social.cjs');
test('old settings keep one pet and all additional features off',()=>{
  const result=normalizeSettings({petId:'old-pet',size:72,behaviour:'playful',position:{x:-400,y:50}});
  assert.ok(Object.values(result.features).every(value=>value===false));assert.deepEqual(result.companions,[]);assert.equal(result.petId,'old-pet');assert.equal(result.size,72);assert.equal(result.primaryVisible,true);
});
test('companions have bounded independent profiles and duplicate IDs cannot create extra windows',()=>{
  const result=normalizeSettings({features:{multiPet:true,interactions:'true'},companions:[{id:'one',petId:'miso',size:1,behaviour:'quiet'},{id:'one',petId:'miso'},{id:'primary',petId:'miso'},{id:'two',petId:'miso'}]});
  assert.equal(result.features.multiPet,true);assert.equal(result.features.interactions,false);assert.equal(result.companions.length,1);assert.equal(result.companions[0].size,48);assert.equal(result.companions[0].behaviour,'quiet');
  assert.equal(normalizeSettings({companions:Array.from({length:20},(_,i)=>({id:'pet-'+i,petId:'miso'}))}).companions.length,3);
});
test('routines handle midnight, daytime ranges and equal hours without imposing all-day rest',()=>{
  const routine={start:22,end:7,idleMinutes:10};
  const at=hour=>new Date(2026,9,22,hour,30);
  assert.equal(resting(routine,at(23),0),true);assert.equal(resting(routine,at(5),0),true);assert.equal(resting(routine,at(12),0),false);assert.equal(resting(routine,at(12),600),true);
  assert.equal(resting({...routine,start:12,end:14},at(13),0),true);assert.equal(resting({...routine,start:0,end:0},at(2),0),false);
});
test('preferences validate roaming rectangles, layouts and screen anchors without persisting arbitrary properties',()=>{
  const result=normalizeSettings({roamArea:{displayId:'1',rect:{x:.9,y:0,width:3,height:1}},layouts:[{id:'desk',name:' Desk ',primary:{petId:'miso',size:999,extra:'ignored'},companions:[],placements:{primary:{displayId:'2',x:.5,y:2}}}],placements:{primary:{displayId:'1',x:Infinity,y:0}},petNames:{miso:' Nori '}});
  assert.equal(result.roamArea.rect.width,1-.9);assert.deepEqual(result.placements,{});assert.equal(result.layouts[0].primary.size,240);assert.equal(result.layouts[0].primary.extra,undefined);assert.equal(result.layouts[0].placements.primary.y,1);assert.equal(result.petNames.miso,'Nori');
});
test('walks stop before another pet and cannot tunnel through it',()=>{
  const origin={x:0,y:0,width:80,height:90},other={x:150,y:0,width:80,height:90},area={x:0,y:0,width:800,height:600};
  const target=freeTarget(origin,{x:700,y:0},[other],area);
  assert.ok(target.x<150);assert.equal(overlaps({...origin,...target},other),false);
  const vertical=freeTarget(origin,{x:0,y:700},[],area);assert.equal(vertical.y,510);
});
test('every social plan uses available actions, finite timing and bounded destinations',()=>{
  const area={x:-600,y:0,width:1200,height:800},a={id:'a',bounds:{x:-200,y:500,width:100,height:120},area},b={id:'b',bounds:{x:100,y:500,width:100,height:120},area};
  for(const kind of ['greet','follow','chase','jump']){const plan=planInteraction(a,b,kind);assert.deepEqual(plan.ids,['a','b']);assert.ok(plan.steps.length>=2);for(const step of plan.steps){assert.ok(['waving','jumping','running-left','running-right'].includes(step.name));assert.ok(step.at>=0&&step.at<plan.duration);if(step.target){assert.ok(step.target.x>=area.x&&step.target.x<=area.x+area.width-100);assert.ok(step.target.y>=area.y&&step.target.y<=area.y+area.height-120);}}}
});
