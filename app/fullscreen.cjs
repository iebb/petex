const {spawn}=require('node:child_process');
const path=require('node:path'),fs=require('node:fs');
const {EventEmitter}=require('node:events');
class FullscreenMonitor extends EventEmitter {
  constructor() {
    super();
    const root=__dirname.replace(/app\.asar(?=[/\\])/,'app.asar.unpacked');
    this.file=path.join(root,'native',`fullscreen-${process.platform}-${process.arch}${process.platform==='win32'?'.exe':''}`);
    this.available=fs.existsSync(this.file);this.child=null;this.pending=false;this.buffer='';this.responseTimer=null;
  }
  check(bounds) {
    if(!this.available || this.pending)return;
    if(!this.child) {
      const child=this.child=spawn(this.file,[],{stdio:['pipe','pipe','ignore'],windowsHide:true});
      child.on('error',()=>this.failed(child));
      child.on('exit',()=>this.failed(child));
      child.stdin.on('error',()=>this.failed(child));
      child.stdout.on('data',chunk=>{
        if(this.child!==child)return;
        this.buffer+=chunk;
        const newline=this.buffer.indexOf('\n');
        if(newline!==-1){const result=this.buffer.slice(0,newline).trim();this.buffer=this.buffer.slice(newline+1);this.pending=false;clearTimeout(this.responseTimer);this.emit('change',{fullscreen:result==='1',locked:result==='-1'});}
      });
    }
    this.pending=true;
    const child=this.child;
    this.responseTimer=setTimeout(()=>this.failed(child),3000);
    this.child.stdin.write(`${process.pid} ${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}\n`);
  }
  failed(child) {
    if(this.child!==child)return;
    this.available=false;this.stop();this.emit('change',{fullscreen:false,locked:false});
  }
  stop() {
    clearTimeout(this.responseTimer);
    const child=this.child;this.child=null;this.pending=false;this.buffer='';
    if(child){child.stdin.end();child.kill();}
  }
}
module.exports={FullscreenMonitor};
