const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
function build(platform=process.platform,arch=process.arch) {
  const dir=path.resolve('app/native'),suffix=platform==='win32'?'.exe':'';
  const output=path.join(dir,`fullscreen-${platform}-${arch}${suffix}`);
  fs.mkdirSync(dir,{recursive:true});
  if(platform==='darwin') {
    if(process.platform!=='darwin')throw Error('Build the macOS fullscreen helper on macOS.');
    execFileSync('clang',['-O2','-fobjc-arc','-arch',arch==='x64'?'x86_64':arch,'native/fullscreen.m','-framework','Cocoa','-framework','CoreGraphics','-o',output],{stdio:'inherit'});
  }else if(platform==='win32') {
    if(process.platform!=='win32')throw Error('Build the Windows fullscreen helper on Windows.');
    const vswhere=path.join(process.env['ProgramFiles(x86)']||'C:\\Program Files (x86)','Microsoft Visual Studio','Installer','vswhere.exe');
    const installation=execFileSync(vswhere,['-latest','-products','*','-requires','Microsoft.VisualStudio.Component.VC.Tools.x86.x64','-property','installationPath'],{encoding:'utf8'}).trim();
    if(!installation)throw Error('Visual Studio C++ Build Tools are required.');
    const devcmd=path.join(installation,'Common7','Tools','VsDevCmd.bat');
    const source=path.resolve('native/fullscreen.cpp');
    const command=`"${devcmd}" -no_logo -arch=${arch==='x64'?'amd64':arch} && cl /nologo /O2 /EHsc "${source}" /Fo"${path.join(dir,'fullscreen.obj')}" /Fe"${output}" user32.lib dwmapi.lib`;
    execFileSync('cmd.exe',['/d','/s','/c','"'+command+'"'],{stdio:'inherit',windowsVerbatimArguments:true});
    fs.rmSync(path.join(dir,'fullscreen.obj'),{force:true});
  }else throw Error('Unsupported fullscreen helper platform: '+platform);
  return output;
}
if(require.main===module)build(process.argv[2]||process.platform,process.argv[3]||process.arch);
module.exports={build};
