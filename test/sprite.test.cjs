const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');
const sprite=fs.readFile(require.resolve('../app/renderer/sprite.js'),'utf8').then(source=>import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`));
test('Codex animation timings stay within used cells and wrap at the end',async()=>{
  const {ANIMATIONS,animationFrame}=await sprite;
  assert.deepEqual(animationFrame('idle',279),{row:0,frame:0});assert.deepEqual(animationFrame('idle',280),{row:0,frame:1});
  for(const [name,animation] of Object.entries(ANIMATIONS)){
    const duration=animation.durations.reduce((a,b)=>a+b,0);
    assert.equal(animationFrame(name,duration-1).frame,animation.durations.length-1);
    assert.equal(animationFrame(name,duration).frame,0);
  }
});
test('cursor gaze follows the v2 clockwise layout with up as the first pose',async()=>{
  const {gazeFrame}=await sprite;
  assert.deepEqual(gazeFrame(0,-100),{row:9,frame:0});assert.deepEqual(gazeFrame(100,0),{row:9,frame:4});
  assert.deepEqual(gazeFrame(0,100),{row:10,frame:0});assert.deepEqual(gazeFrame(-100,0),{row:10,frame:4});
});
test('random animations use every non-idle imported row and only supported built-in states',async()=>{
  const {availableAnimations}=await sprite;
  assert.deepEqual(new Set(availableAnimations({builtin:false})),new Set(['waving','jumping','failed','waiting','running','review','running-left','running-right']));
  assert.deepEqual(availableAnimations({builtin:true}),['waving','jumping','running-left','running-right']);
});
test('random animations wait, complete their loops, and avoid consecutive repeats',async()=>{
  const {RandomAnimations,ANIMATIONS}=await sprite;const behavior=new RandomAnimations(()=>0);const pet={builtin:false};
  assert.equal(behavior.next(pet,0,true),null);assert.equal(behavior.next(pet,44999,true),null);
  const first=behavior.next(pet,45000,true);assert.equal(first.name,'waving');assert.equal(first.duration,ANIMATIONS.waving.durations.reduce((a,b)=>a+b,0));
  assert.equal(behavior.next(pet,45001,true),null);
  const second=behavior.next(pet,behavior.nextAt,true);assert.notEqual(second.name,first.name);
});
test('pause, hiding, dragging and manual actions postpone random playback without catch-up',async()=>{
  const {RandomAnimations}=await sprite;const behavior=new RandomAnimations(()=>0);const pet={builtin:false};
  behavior.next(pet,0,true);assert.equal(behavior.next(pet,13000,true,true),null);assert.equal(behavior.nextAt,58000);
  assert.equal(behavior.next(pet,24000,false),null);assert.equal(behavior.nextAt,null);
  assert.equal(behavior.next(pet,90000,true),null);assert.equal(behavior.nextAt,135000);
  behavior.reset();assert.equal(behavior.next(pet,110000,true),null);assert.equal(behavior.nextAt,155000);
});
test('calm has longer quiet intervals than playful, and quiet never schedules actions',async()=>{
  const {RandomAnimations}=await sprite;const schedule=new RandomAnimations(()=>0);
  assert.equal(schedule.delay('calm'),45000);assert.equal(schedule.delay('playful'),15000);
  assert.equal(schedule.next({builtin:false},0,true,false,'quiet'),null);assert.equal(schedule.nextAt,null);
});
test('static preview drawing creates no recurring animation task and hidden sprites stop immediately',async()=>{
  const {PetSprite}=await sprite;
  const canvas={getContext:()=>({clearRect(){},save(){},scale(){},restore(){},drawImage(){}})};
  const preview=new PetSprite(canvas);preview.motion=false;
  await preview.setPet({id:'test',builtin:false,assetUrl:'unused'}).catch(()=>{});
  assert.equal(preview.timer,null);
  preview.image={};preview.motion=true;assert.notEqual(preview.timer,null);
  preview.active=false;assert.equal(preview.timer,null);
  preview.stop();
});
