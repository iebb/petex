const centre = b=>({x:b.x+b.width/2,y:b.y+b.height/2});
function overlaps(a,b,gap=8) { return a.x<b.x+b.width-gap&&a.x+a.width-gap>b.x&&a.y<b.y+b.height-gap&&a.y+a.height-gap>b.y; }
function clamp(bounds,area) {return {x:Math.round(Math.max(area.x,Math.min(bounds.x,area.x+area.width-bounds.width))),y:Math.round(Math.max(area.y,Math.min(bounds.y,area.y+area.height-bounds.height))) };}
function freeTarget(origin,target,others,area) {
  const end=clamp({...origin,...target},area);
  let last={x:origin.x,y:origin.y};
  const distance=Math.hypot(end.x-origin.x,end.y-origin.y),steps=Math.max(1,Math.ceil(distance/8));
  const touching=others.filter(b=>overlaps(origin,b));
  for(let i=1;i<=steps;i++){
    const candidate={...origin,x:Math.round(origin.x+(end.x-origin.x)*i/steps),y:Math.round(origin.y+(end.y-origin.y)*i/steps)};
    if(others.some(b=>!touching.includes(b)&&overlaps(candidate,b)))break;
    last={x:candidate.x,y:candidate.y};
  }
  return last;
}
function planInteraction(a,b,kind='greet') {
  const left=a.bounds.x<=b.bounds.x?a:b,right=left===a?b:a;
  const gap=Math.max(left.bounds.width,right.bounds.width)+12;
  const steps=[];
  if(kind==='follow'||kind==='chase'){
    const direction=right.bounds.x+right.bounds.width+100<right.area.x+right.area.width?1:-1;
    const leader=direction===1?right:left,follower=leader===a?b:a;
    const target=clamp({...leader.bounds,x:leader.bounds.x+direction*(kind==='chase'?150:90)},leader.area);
    steps.push({at:0,id:leader.id,name:direction>0?'running-right':'running-left',target,duration:1800});
    const following=clamp({...follower.bounds,x:target.x-direction*gap,y:target.y},follower.area);
    steps.push({at:350,id:follower.id,name:following.x>=follower.bounds.x?'running-right':'running-left',target:following,duration:1800});
    steps.push({at:2400,id:leader.id,name:'waving'},{at:2750,id:follower.id,name:'jumping'});
  }else if(kind==='jump')steps.push({at:600,id:a.id,name:'jumping'},{at:600,id:b.id,name:'jumping'});
  else {
    if(Math.hypot(centre(a.bounds).x-centre(b.bounds).x,centre(a.bounds).y-centre(b.bounds).y)>gap*1.4){
      const target=clamp({...left.bounds,x:right.bounds.x-left.bounds.width-12,y:right.bounds.y},left.area);
      steps.push({at:0,id:left.id,name:target.x>=left.bounds.x?'running-right':'running-left',target,duration:1600});
    }
    steps.push({at:1800,id:left.id,name:'waving'},{at:2600,id:right.id,name:'waving'},{at:3400,id:left.id,name:'jumping'});
  }
  return {kind,ids:[a.id,b.id],steps,duration:4800};
}
module.exports={centre,clamp,overlaps,freeTarget,planInteraction};
