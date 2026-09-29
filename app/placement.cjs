function clamp(bounds, area) {
  return {x:Math.round(Math.max(area.x,Math.min(bounds.x,area.x+area.width-bounds.width))),y:Math.round(Math.max(area.y,Math.min(bounds.y,area.y+area.height-bounds.height)))};
}
function snapPosition(bounds,area,threshold=14) {
  const position=clamp(bounds,area);
  for(const [axis,extent] of [['x','width'],['y','height']]) {
    const end=area[axis]+area[extent]-bounds[extent];
    if(Math.abs(position[axis]-area[axis])<=threshold)position[axis]=area[axis];
    else if(Math.abs(position[axis]-end)<=threshold)position[axis]=end;
  }
  return position;
}
function walkTarget(bounds,area,direction,distance) {
  return clamp({...bounds,x:bounds.x+(direction==='running-left'?-distance:distance)},area);
}
module.exports={snapPosition,walkTarget};
