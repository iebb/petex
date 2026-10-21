const {BrowserWindow,screen,powerMonitor}=require('electron');
const path=require('node:path');
const {DragTracker}=require('./drag.cjs');
const {snapPosition}=require('./placement.cjs');
const {resting}=require('./preferences.cjs');
const {centre,clamp,freeTarget,planInteraction}=require('./social.cjs');

// One native window per pet, one cursor poll and one movement clock for the group.
class DesktopPets {
  constructor(options) {
    Object.assign(this,options);this.instances=new Map();this.timer=null;this.interval=0;this.social=null;this.nextSocial=0;this.lastAmbient=0;this.routineResting=false;this.toy=null;this.disposed=false;
    this.create('primary');
  }
  get primary(){return this.instances.get('primary');}
  get windows(){return [...this.instances.values()].map(p=>p.win);}
  fromWindow(win){return [...this.instances.values()].find(p=>p.win===win);}
  config(p) {
    const {settings}=this.getState();
    if(p.id==='primary')return {...settings,visible:settings.visible&&(!settings.features.multiPet||settings.primaryVisible),...(this.routineResting?{behaviour:'quiet',randomAnimations:false}:{})};
    const item=settings.companions.find(c=>c.id===p.id)||{};
    const custom=settings.features.personalities?{size:item.size,behaviour:item.behaviour,followCursor:item.followCursor,randomAnimations:item.behaviour!=='quiet'}:{};
    return {...settings,...custom,petId:item.petId||'miso',position:item.position,visible:settings.visible&&item.visible!==false,...(this.routineResting?{behaviour:'quiet',randomAnimations:false}:{})};
  }
  active(p) {
    if(!p||!p.loaded||p.win.isDestroyed())return false;
    const state=this.getState(),config=this.config(p);
    const hidden=state.fullscreenDisplays?.has(String(screen.getDisplayMatching(p.win.getBounds()).id))||false;
    return config.visible&&state.screenAwake&&!(config.hideFullscreen&&hidden);
  }
  create(id) {
    const p={id,loaded:false,drag:null,walking:null,busyUntil:0,lastCursor:null,lastPetting:-Infinity,activity:null};
    const config=this.config(p),width=config.size+32,height=Math.ceil(config.size*208/192)+32;
    p.win=new BrowserWindow({width,height,frame:false,transparent:true,backgroundColor:'#00000000',hasShadow:false,resizable:false,maximizable:false,minimizable:false,fullscreenable:false,skipTaskbar:true,show:false,title:id==='primary'?'Petex pet':`Petex pet · ${id}`,webPreferences:this.windowOptions()});
    this.secure(p.win);p.win.setIgnoreMouseEvents(true,{forward:true});this.instances.set(id,p);
    p.win.on('close',e=>{if(!this.disposed){e.preventDefault();this.hide(p);}});
    p.ready=p.win.loadFile(path.join(__dirname,'renderer','pet.html')).then(()=>{if(!this.disposed&&!p.win.isDestroyed()){p.loaded=true;this.place(p);this.refresh();}});
    return p;
  }
  area(p) {
    const {settings}=this.getState(),bounds=p.win.getBounds();
    const zone=settings.features.roaming?settings.roamArea:null;
    const display=zone?screen.getAllDisplays().find(d=>String(d.id)===zone.displayId):null;
    const work=(display||screen.getDisplayMatching(bounds)).workArea;
    if(!zone?.rect||!display)return work;
    const r=zone.rect,config=this.config(p),width=Math.min(work.width,Math.max(config.size+32,Math.round(work.width*r.width))),height=Math.min(work.height,Math.max(Math.ceil(config.size*208/192)+32,Math.round(work.height*r.height)));
    return {x:Math.min(Math.round(work.x+work.width*r.x),work.x+work.width-width),y:Math.min(Math.round(work.y+work.height*r.y),work.y+work.height-height),width,height};
  }
  place(p,reflow=false) {
    const {settings}=this.getState(),config=this.config(p),width=config.size+32,height=Math.ceil(config.size*208/192)+32;
    let position=config.position;
    const anchor=settings.placements[p.id];
    if((reflow||!position)&&anchor){const display=screen.getAllDisplays().find(d=>String(d.id)===anchor.displayId)||screen.getPrimaryDisplay();position={x:display.workArea.x+anchor.x*(display.workArea.width-width),y:display.workArea.y+anchor.y*(display.workArea.height-height)};}
    if(!position){const area=screen.getPrimaryDisplay().workArea;const offset=[...this.instances.keys()].indexOf(p.id);position={x:area.x+area.width-width-64-offset*(width+16),y:area.y+area.height-height-24};}
    p.win.setBounds({...clamp({...position,width,height},this.area(p)),width,height});
    p.win.setAlwaysOnTop(config.alwaysOnTop,'floating');
    if(process.platform==='darwin')p.win.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
    this.remember(p,false);
  }
  remember(p,anchor=true) {
    const {settings}=this.getState(),bounds=p.win.getBounds(),pos={x:bounds.x,y:bounds.y};
    if(p.id==='primary')settings.position=pos;else{const item=settings.companions.find(c=>c.id===p.id);if(item)item.position=pos;}
    if(anchor){const d=screen.getDisplayMatching(bounds),a=d.workArea;settings.placements[p.id]={displayId:String(d.id),x:Math.max(0,Math.min(1,(bounds.x-a.x)/Math.max(1,a.width-bounds.width))),y:Math.max(0,Math.min(1,(bounds.y-a.y)/Math.max(1,a.height-bounds.height)))};}
  }
  apply(reflow=false) {
    if(this.disposed)return;
    const {settings,pets}=this.getState();
    if(!reflow)for(const p of this.instances.values())if(p.walking||p.drag)this.remember(p);
    this.cancelSocial();
    const ids=settings.features.multiPet?settings.companions.filter(c=>pets.some(p=>p.id===c.petId)).map(c=>c.id):[];
    for(const [id,p] of this.instances)if(id!=='primary'&&!ids.includes(id)){this.instances.delete(id);p.win.destroy();}
    for(const id of ids)if(!this.instances.has(id))this.create(id);
    for(const p of this.instances.values()){p.walking=null;p.drag=null;this.place(p,reflow);}
    if(!settings.features.toys||!settings.motion||!settings.visible)this.closeToy();
    this.routineResting=settings.features.routines&&resting(settings.routine,new Date(),powerMonitor.getSystemIdleTime());
    this.refresh();
  }
  refresh() {
    if(this.disposed)return;
    for(const p of this.instances.values()){
      if(!this.active(p)){if(p.walking||p.drag)this.remember(p);p.walking=null;p.drag=null;p.win.hide();}
      else if(!p.win.isVisible())p.win.showInactive();
    }
    if(this.social&&this.social.ids.some(id=>!this.active(this.instances.get(id))))this.cancelSocial();
    if(this.toy&&!this.active(this.instances.get(this.toy.hostId)))this.closeToy();
    if(!this.getState().screenAwake||!this.getState().settings.visible){this.cancelSocial();this.closeToy();}
    this.schedule();this.onChange();
  }
  constrain() {
    if(this.disposed)return;
    const now=performance.now();
    for(const p of this.instances.values()){
      const bounds=p.win.getBounds(),area=this.area(p),position=clamp(bounds,area);
      if(position.x!==bounds.x||position.y!==bounds.y)p.win.setPosition(position.x,position.y);
      if(p.walking){const walk=p.walking;p.walking={origin:{...bounds,...position},target:clamp({...bounds,...walk.target},area),started:now,duration:Math.max(1,walk.duration-(now-walk.started))};}
      this.remember(p,false);
    }
    this.refresh();this.onSave();
  }
  schedule() {
    if(this.disposed){clearInterval(this.timer);this.timer=null;this.interval=0;return;}
    const active=[...this.instances.values()].filter(p=>this.active(p));
    const interval=!active.length?0:active.some(p=>p.drag)?16:active.some(p=>p.walking)||this.toy?33:active.some(p=>this.config(p).motion)?50:120;
    if(interval===this.interval)return;clearInterval(this.timer);this.interval=interval;this.timer=interval?setInterval(()=>this.tick(),interval):null;
  }
  tick() {
    if(this.disposed)return;
    const now=performance.now(),cursor=screen.getCursorScreenPoint();
    for(const p of this.instances.values()){
      if(!this.active(p))continue;
      let movement=null;
      if(p.drag){movement=p.drag.update(cursor,now);if(movement.dragging){const bounds=p.win.getBounds(),pos=clamp({...bounds,...movement.position},this.area(p));p.win.setPosition(pos.x,pos.y);}}
      if(p.walking){
        const w=p.walking,progress=Math.min(1,(now-w.started)/w.duration),eased=progress*progress*(3-2*progress),bounds=p.win.getBounds();
        const candidate={x:Math.round(w.origin.x+(w.target.x-w.origin.x)*eased),y:Math.round(w.origin.y+(w.target.y-w.origin.y)*eased)};
        const target=freeTarget(bounds,candidate,this.obstacles(p),this.area(p));p.win.setPosition(target.x,target.y);
        if(progress>=1||target.x!==candidate.x||target.y!==candidate.y){p.walking=null;this.remember(p);this.onSave();this.schedule();}
      }
      const b=p.win.getBounds(),inside=cursor.x>=b.x&&cursor.y>=b.y&&cursor.x<b.x+b.width&&cursor.y<b.y+b.height;
      let socialGaze=null;
      if(this.social?.ids.includes(p.id)){const friend=this.instances.get(this.social.ids.find(id=>id!==p.id));if(friend){const c=centre(friend.win.getBounds());socialGaze={x:c.x-b.x-b.width/2,y:c.y-b.y-b.height/2};}}
      if(!p.drag&&!p.walking&&!inside&&!socialGaze&&p.lastCursor?.x===cursor.x&&p.lastCursor?.y===cursor.y)continue;
      p.lastCursor=cursor;p.win.webContents.send('pet:cursor',{x:cursor.x-b.x,y:cursor.y-b.y,dragging:movement?.dragging||false,direction:movement?.direction||null,dragGaze:movement?.gaze||null,walking:!!p.walking,socialGaze,socialUntil:this.social?now+250:0});
    }
    if(this.social){
      while(this.social.steps.length&&now-this.social.started>=this.social.steps[0].at){const step=this.social.steps.shift(),p=this.instances.get(step.id);if(p&&this.active(p)&&!p.drag){if(step.target)this.move(p,step.target,step.duration,step.name);else this.action(p,step.name,true);}}
      if(now>=this.social.until)this.cancelSocial();
    }
    if(this.toy)this.tickToy(now,cursor);
    if(now-this.lastAmbient>=1000){this.lastAmbient=now;this.ambient(now);}
  }
  obstacles(p){return [...this.instances.values()].filter(other=>other!==p&&this.active(other)).map(other=>other.win.getBounds());}
  move(p,target,duration,name) {
    if(!this.active(p)||p.drag||!this.config(p).motion)return;
    const origin=p.win.getBounds(),end=freeTarget(origin,target,this.obstacles(p),this.area(p));
    if(end.x===origin.x&&end.y===origin.y)return;
    p.walking={origin,target:end,started:performance.now(),duration};p.busyUntil=performance.now()+duration;
    if(name)this.action(p,name,true,duration);this.schedule();
  }
  wander(p,name,duration) {
    const config=this.config(p);
    if(!this.active(p)||!config.motion||!config.randomAnimations||p.drag||!['running-left','running-right'].includes(name)||!Number.isFinite(duration)||duration<250||duration>3600)throw Object.assign(new Error(),{key:'walkError'});
    if(this.social?.ids.includes(p.id))return;
    const b=p.win.getBounds();this.move(p,{x:b.x+(name==='running-left'?-1:1)*Math.max(24,Math.min(96,config.size*.65)),y:b.y},duration);
  }
  action(p,name,coordinated=false,duration) {
    if(!p||!this.active(p)||!this.config(p).motion||p.drag)return;
    if(!coordinated){this.cancelSocial();p.walking=null;}
    p.busyUntil=performance.now()+(duration||1400);p.activity=name;p.win.webContents.send('pet:action',duration?{name,duration}:name);this.schedule();
  }
  pressStart(p) {if(!this.active(p))return;this.cancelSocial();p.walking=null;p.drag=new DragTracker(screen.getCursorScreenPoint(),p.win.getBounds(),performance.now());p.win.setIgnoreMouseEvents(false);this.schedule();}
  pressEnd(p) {
    if(p.drag){const wasDragging=p.drag.dragging;p.drag=null;const bounds=p.win.getBounds();const position=wasDragging&&this.getState().settings.snapEdges?snapPosition(bounds,this.area(p)):clamp(bounds,this.area(p));p.win.setPosition(position.x,position.y);this.remember(p);}
    p.busyUntil=performance.now()+3000;this.refresh();this.onSave();
  }
  hit(p,value){if(!p.drag)p.win.setIgnoreMouseEvents(value!==true,{forward:true});}
  hide(p) {const {settings}=this.getState();if(p.id==='primary'){if(settings.features.multiPet)settings.primaryVisible=false;else settings.visible=false;}else{const item=settings.companions.find(c=>c.id===p.id);if(item)item.visible=false;}this.refresh();this.onSave();}
  pet(p) {const {pets}=this.getState();return pets.find(pet=>pet.id===this.config(p).petId)||pets[0];}
  petting(p) {
    const now=performance.now();if(!this.getState().settings.features.petting||now-p.lastPetting<8000||p.drag||!this.active(p)||!this.config(p).motion)return false;
    p.lastPetting=now;this.action(p,'waving');p.win.webContents.send('pet:stroke');return true;
  }
  cancelSocial() {if(this.social){for(const id of this.social.ids){const p=this.instances.get(id);if(p){if(p.walking)this.remember(p);p.walking=null;p.activity=null;p.win.webContents.send('pet:social-end');}}this.social=null;}this.nextSocial=performance.now()+25000+Math.random()*35000;}
  socialPlan(kind,force=false) {
    const {settings}=this.getState(),now=performance.now();
    if(!settings.features.interactions||!settings.features.multiPet||!settings.motion||this.routineResting||this.social)return false;
    const candidates=[...this.instances.values()].filter(p=>this.active(p)&&!p.drag&&!p.walking&&this.config(p).behaviour!=='quiet'&&(force||p.busyUntil<=now));
    let pair=null,best=Infinity;
    for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){const a=candidates[i],b=candidates[j];if(screen.getDisplayMatching(a.win.getBounds()).id!==screen.getDisplayMatching(b.win.getBounds()).id)continue;const ac=centre(a.win.getBounds()),bc=centre(b.win.getBounds()),distance=Math.hypot(ac.x-bc.x,ac.y-bc.y);if(distance<best&&distance<800){pair=[a,b];best=distance;}}
    if(!pair)return false;
    const plan=planInteraction(...pair.map(p=>({id:p.id,bounds:p.win.getBounds(),area:this.area(p)})),kind||['greet','follow','chase','jump'][Math.floor(Math.random()*4)]);
    this.social={...plan,started:now,until:now+plan.duration};
    for(const p of pair){p.activity=plan.kind;p.busyUntil=this.social.until;p.win.webContents.send('pet:social-start',plan.duration);}
    this.onChange();return true;
  }
  ambient(now) {
    const {settings}=this.getState();
    if(settings.features.routines){const next=resting(settings.routine,new Date(),powerMonitor.getSystemIdleTime());if(next!==this.routineResting){this.routineResting=next;if(next)this.cancelSocial();this.onChange();}}
    if(settings.features.interactions&&now>=this.nextSocial){this.socialPlan();this.nextSocial=now+25000+Math.random()*35000;}
  }
  reset() {const {settings}=this.getState();settings.position=null;settings.primaryVisible=true;settings.placements={};for(const item of settings.companions){item.position=null;item.visible=true;}this.apply();}
  throwBall() {
    const {settings}=this.getState(),host=[...this.instances.values()].find(p=>this.active(p));if(!settings.features.toys||!settings.motion||!host)return false;
    this.cancelSocial();this.closeToy();const pet=host.win.getBounds(),area=this.area(host),width=32;
    const win=new BrowserWindow({width,height:width,frame:false,transparent:true,hasShadow:false,resizable:false,skipTaskbar:true,show:false,alwaysOnTop:true,webPreferences:this.windowOptions()});this.secure(win);
    if(process.platform==='darwin')win.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
    const start=clamp({x:pet.x+pet.width/2,y:pet.y-140,width,height:width},area);
    this.toy={win,hostId:host.id,x:start.x,y:start.y,vx:(Math.random()>.5?1:-1)*.25,vy:-.2,last:performance.now(),expires:performance.now()+22000,nextChase:0,drag:false};
    win.setPosition(start.x,start.y);win.loadFile(path.join(__dirname,'renderer','toy.html')).then(()=>{if(this.toy?.win===win)win.showInactive();});win.on('closed',()=>{if(this.toy?.win===win){this.toy=null;this.schedule();}});this.schedule();return true;
  }
  toyPress(pressed) {if(!this.toy)return;const toy=this.toy;if(toy.drag===pressed)return;toy.drag=pressed;if(pressed)toy.vx=toy.vy=0;toy.expires=performance.now()+22000;toy.last=performance.now();}
  tickToy(now,cursor) {
    const toy=this.toy,host=this.instances.get(toy.hostId);if(!this.getState().settings.features.toys||!host||!this.active(host)||now>toy.expires){this.closeToy();return;}
    const dt=Math.min(50,now-toy.last);toy.last=now;const area=this.area(host);
    if(toy.drag){toy.vx=Math.max(-1,Math.min(1,(cursor.x-16-toy.x)/Math.max(dt,1)));toy.vy=Math.max(-1,Math.min(1,(cursor.y-16-toy.y)/Math.max(dt,1)));toy.x=cursor.x-16;toy.y=cursor.y-16;}
    else{toy.vy+=.0012*dt;toy.x+=toy.vx*dt;toy.y+=toy.vy*dt;if(toy.x<=area.x||toy.x+32>=area.x+area.width){toy.vx*=-.7;toy.x=Math.max(area.x,Math.min(toy.x,area.x+area.width-32));}if(toy.y+32>=area.y+area.height){toy.y=area.y+area.height-32;toy.vy=Math.abs(toy.vy)<.07?0:-toy.vy*.6;toy.vx*=.95;}toy.y=Math.max(area.y,toy.y);}
    toy.win.setPosition(Math.round(toy.x),Math.round(toy.y));
    if(!toy.drag&&now>=toy.nextChase){toy.nextChase=now+2000;for(const p of this.instances.values()){const config=this.config(p);if(!this.active(p)||p.drag||p.walking||config.behaviour==='quiet'||this.routineResting)continue;const b=p.win.getBounds(),target=clamp({...b,x:toy.x-b.width/2+16,y:toy.y-b.height+20},this.area(p));if(Math.hypot(b.x-target.x,b.y-target.y)<50)this.action(p,'jumping');else this.move(p,target,1600,target.x>=b.x?'running-right':'running-left');}}
  }
  closeToy(){if(this.toy){const win=this.toy.win;this.toy=null;if(!win.isDestroyed())win.destroy();}this.schedule();}
  dispose(){
    this.disposed=true;clearInterval(this.timer);this.timer=null;this.interval=0;this.social=null;this.toy=null;
    // Stop activity here; app.quit owns the native window close sequence.
  }
}
module.exports={DesktopPets};
