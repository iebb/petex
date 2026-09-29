import {PetSprite, ANIMATIONS, RandomAnimations} from './sprite.js';
const api=window.pedex,canvas=document.getElementById('pet'),sprite=new PetSprite(canvas);
const randomAnimations=new RandomAnimations();
const HOLD_MS=550,DRAG_THRESHOLD=6;
let settings,selectedPet,active=false,down=null,dragging=false,lastHit=null,actionUntil=0,holdTimer=null,behaviourTimer=null;
function cancelHold(){clearTimeout(holdTimer);holdTimer=null;}
function plan() {
  clearTimeout(behaviourTimer);behaviourTimer=null;
  if(!settings||!active||!settings.motion||down)return;
  const now=performance.now();
  if(now<actionUntil){behaviourTimer=setTimeout(plan,Math.max(1,actionUntil-now));return;}
  if(sprite.state!=='idle'){sprite.action('idle');actionUntil=0;}
  const next=randomAnimations.next(selectedPet,now,settings.randomAnimations,false,settings.behaviour);
  if(next){
    sprite.action(next.name);sprite.gaze=null;actionUntil=now+next.duration;
    if(next.name.startsWith('running-'))api.wander(next.name,next.duration).catch(()=>{});
  }
  const deadline=next?actionUntil:randomAnimations.nextAt;
  if(deadline!==null)behaviourTimer=setTimeout(plan,Math.max(1,deadline-now));
}
function resetBehaviour(){randomAnimations.reset();plan();}
function action(name,fromPress=false){
  if(!settings?.motion||!active||!ANIMATIONS[name]||dragging||(down&&!fromPress))return;
  sprite.action(name);sprite.gaze=null;
  actionUntil=performance.now()+ANIMATIONS[name].durations.reduce((a,b)=>a+b,0);
  resetBehaviour();
}
function render(state){
  document.documentElement.lang=state.locale;canvas.setAttribute('aria-label',globalThis.PetexI18n.translate(state.locale,'petInstructions'));
  const next=state.settings,pet=state.pets.find(p=>p.id===next.petId)||state.pets[0];
  const changed=pet.id!==selectedPet?.id||next.motion!==settings?.motion||state.petActive!==active||next.randomAnimations!==settings?.randomAnimations||next.behaviour!==settings?.behaviour;
  if(down&&(!state.petActive||pet.id!==selectedPet?.id))finishPointer(null,true);
  settings=next;selectedPet=pet;active=state.petActive;
  sprite.active=active;sprite.motion=settings.motion;
  sprite.setPet(pet).catch(()=>sprite.setPet(state.pets[0]));
  if(changed){actionUntil=0;sprite.action('idle');resetBehaviour();}
}
api.onState(render);api.getState().then(render);api.onAction(name=>action(name));
api.onCursor(cursor=>{
  if(!settings||!active)return;
  const rect=canvas.getBoundingClientRect(),x=cursor.x-rect.x,y=cursor.y-rect.y;
  const isDragging=cursor.dragging&&!!down;
  if(isDragging){
    dragging=true;down.moved=true;cancelHold();actionUntil=0;
    const state=selectedPet.builtin||selectedPet.spriteVersionNumber===2?'idle':cursor.direction;
    if(sprite.state!==state)sprite.action(state);
  }
  const gx=x-rect.width/2,gy=y-rect.height*.45;
  sprite.gaze=isDragging?cursor.dragGaze:!cursor.walking&&settings.followCursor&&settings.motion&&Math.hypot(gx,gy)>35&&Math.hypot(gx,gy)<1100?{x:gx,y:gy}:null;
  let hit=false;
  if(x>=0&&y>=0&&x<rect.width&&y<rect.height){try{hit=sprite.ctx.getImageData(Math.floor(x/rect.width*384),Math.floor(y/rect.height*416),1,1).data[3]>30;}catch{hit=true;}}
  if(hit!==lastHit&&!down){lastHit=hit;api.hit(hit).catch(()=>{});}
});
canvas.addEventListener('pointerdown',event=>{
  if(event.button!==0||down)return;
  down={x:event.screenX,y:event.screenY,id:event.pointerId,moved:false,longPressed:false};
  canvas.setPointerCapture(event.pointerId);clearTimeout(behaviourTimer);actionUntil=0;sprite.action('idle');
  api.pressStart().catch(()=>finishPointer(null,true));cancelHold();
  holdTimer=setTimeout(()=>{if(!down||down.moved||dragging)return;down.longPressed=true;action('jumping',true);},HOLD_MS);
});
canvas.addEventListener('pointermove',event=>{if(down&&Math.hypot(event.screenX-down.x,event.screenY-down.y)>=DRAG_THRESHOLD){down.moved=true;cancelHold();}});
function finishPointer(event,cancelled=false){
  if(!down)return;
  const press=down,moved=dragging||press.moved;down=null;dragging=false;cancelHold();
  if(canvas.hasPointerCapture(press.id))canvas.releasePointerCapture(press.id);
  api.pressEnd().catch(()=>{});lastHit=null;
  if(moved||cancelled){sprite.action('idle');sprite.gaze=null;actionUntil=0;resetBehaviour();}
  else if(!press.longPressed)action('waving');else plan();
}
canvas.addEventListener('pointerup',event=>finishPointer(event));
canvas.addEventListener('pointercancel',event=>finishPointer(event,true));
canvas.addEventListener('lostpointercapture',event=>finishPointer(event,true));
window.addEventListener('blur',()=>finishPointer(null,true));
canvas.addEventListener('contextmenu',event=>{event.preventDefault();finishPointer(null,true);api.menu();});
