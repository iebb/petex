const {execFileSync}=require('node:child_process');
const path=require('node:path'),fs=require('node:fs');
const {packagePaths}=require('./verify-package.cjs');
function verify(platform,arch){
  const paths=packagePaths(platform,arch);
  if(platform==='darwin'){
    execFileSync('codesign',['--verify','--deep','--strict',paths.bundle],{stdio:'inherit'});
    // Gatekeeper checks the notarization ticket as well as the signature.
    execFileSync('xcrun',['stapler','validate',paths.bundle],{stdio:'inherit'});
    execFileSync('spctl',['--assess','--type','execute','--verbose=2',paths.bundle],{stdio:'inherit'});
  }else{
    const installer=path.resolve('release',`Petex-${require('../package.json').version}-win-x64.exe`);
    for(const file of [paths.executable,installer]){
      if(!fs.existsSync(file))throw new Error('Signed executable is missing.');
      execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$signature=Get-AuthenticodeSignature -LiteralPath $env:PETEX_VERIFY_SIGNATURE; if($signature.Status -ne 'Valid'){throw 'Authenticode verification failed'}"],{encoding:'utf8',env:{...process.env,PETEX_VERIFY_SIGNATURE:file}});
    }
  }
  console.log(`Verified release signatures for ${platform}/${arch}.`);
}
if(require.main===module)verify(process.argv[2]||process.platform,process.argv[3]||process.arch);
module.exports={verify};
