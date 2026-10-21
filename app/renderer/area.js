const box=document.getElementById('selection'),save=document.getElementById('save');let start=null,rect=null;
window.pedex.getState().then(state=>{const t=key=>globalThis.PetexI18n.translate(state.locale,key);document.documentElement.lang=state.locale;document.getElementById('hint').textContent=t('drawHint');document.getElementById('cancel').textContent=t('cancel');save.textContent=t('useArea');});
document.addEventListener('pointerdown',event=>{if(event.target.closest('.instructions')||event.button!==0)return;start={x:event.clientX,y:event.clientY};document.body.setPointerCapture(event.pointerId);});
document.addEventListener('pointermove',event=>{if(!start)return;rect={x:Math.min(start.x,event.clientX),y:Math.min(start.y,event.clientY),width:Math.abs(start.x-event.clientX),height:Math.abs(start.y-event.clientY)};for(const k of ['x','y','width','height'])box.style[{x:'left',y:'top',width:'width',height:'height'}[k]]=rect[k]+'px';save.disabled=rect.width<280||rect.height<300;});
document.addEventListener('pointerup',event=>{start=null;if(document.body.hasPointerCapture(event.pointerId))document.body.releasePointerCapture(event.pointerId);});
document.addEventListener('pointercancel',()=>start=null);
document.getElementById('cancel').onclick=()=>window.pedex.closeArea();
save.onclick=()=>{if(!rect||save.disabled)return;window.pedex.saveArea({displayId:new URLSearchParams(location.search).get('displayId'),rect:{x:rect.x/innerWidth,y:rect.y/innerHeight,width:rect.width/innerWidth,height:rect.height/innerHeight}});};
document.addEventListener('keydown',event=>{if(event.key==='Escape')window.pedex.closeArea();if(event.key==='Enter'&&!save.disabled)save.click();});
