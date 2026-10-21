const ball=document.getElementById('ball'),ctx=ball.getContext('2d');
ctx.beginPath();ctx.arc(32,32,27,0,Math.PI*2);ctx.fillStyle='#e6ad60';ctx.fill();ctx.lineWidth=4;ctx.strokeStyle='#a56537';ctx.stroke();ctx.beginPath();ctx.ellipse(32,32,12,27,-.45,0,Math.PI*2);ctx.stroke();
ball.addEventListener('pointerdown',event=>{if(event.button!==0)return;ball.setPointerCapture(event.pointerId);window.pedex.toyPress(true);});
for(const type of ['pointerup','pointercancel','lostpointercapture'])ball.addEventListener(type,()=>window.pedex.toyPress(false));
