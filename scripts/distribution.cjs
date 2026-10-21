const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
function configuration(target,env=process.env) {
  if(!['mac','win'].includes(target))throw new Error('Choose mac or win.');
  const config=structuredClone(require('../package.json').build);
  const signed=!!(target==='mac'?(env.MAC_CSC_LINK||env.CSC_LINK):(env.WIN_CSC_LINK||env.CSC_LINK));
  config.forceCodeSigning=signed;
  if(target==='mac'){
    config.mac.identity=null;config.mac.notarize=false;
    if(signed){
      if(!(env.APPLE_API_KEY_CONTENT||env.APPLE_API_KEY)||!env.APPLE_API_KEY_ID||!env.APPLE_API_ISSUER)throw new Error('Signed macOS releases require notarization credentials.');
      delete config.mac.identity;
      if(env.PETEX_MAC_IDENTITY)config.mac.identity=env.PETEX_MAC_IDENTITY;
      config.mac.hardenedRuntime=true;config.mac.entitlements='build/entitlements.mac.plist';config.mac.entitlementsInherit='build/entitlements.mac.plist';config.mac.notarize=true;
    }
  }
  return {config,signed};
}
async function run(target,args) {
  const {config,signed}=configuration(target);let temporary;
  try{
    if(target==='mac'&&signed){
      process.env.CSC_LINK=process.env.MAC_CSC_LINK||process.env.CSC_LINK;
      process.env.CSC_KEY_PASSWORD=process.env.MAC_CSC_KEY_PASSWORD||process.env.CSC_KEY_PASSWORD||'';
      process.env.CSC_IDENTITY_AUTO_DISCOVERY='true';
      if(process.env.APPLE_API_KEY_CONTENT){
        temporary=await fs.mkdtemp(path.join(os.tmpdir(),'petex-notarize-'));
        const input=process.env.APPLE_API_KEY_CONTENT,key=input.includes('-----BEGIN')?input:Buffer.from(input,'base64').toString('utf8');
        if(!key.includes('-----BEGIN PRIVATE KEY-----'))throw new Error('The notarization key is not a private-key PEM.');
        process.env.APPLE_API_KEY=path.join(temporary,'AuthKey.p8');await fs.writeFile(process.env.APPLE_API_KEY,key,{mode:0o600});delete process.env.APPLE_API_KEY_CONTENT;
      }
    }
    const arch=args.includes('--arm64')?'arm64':args.includes('--x64')?'x64':process.arch;
    if(!['arm64','x64'].includes(arch)||args.some(value=>!['--arm64','--x64'].includes(value)))throw new Error('Use --arm64 or --x64.');
    const {build,Platform,Arch}=require('electron-builder');
    console.log(`Building ${target}/${arch}: ${signed?'signed'+(target==='mac'?' and notarized':''):'unsigned (signing credentials not configured)'}.`);
    await build({config,targets:(target==='mac'?Platform.MAC:Platform.WINDOWS).createTarget(target==='mac'?['dmg','zip']:['nsis'],Arch[arch]),publish:'never'});
    if(signed)require('./verify-signing.cjs').verify(target==='mac'?'darwin':'win32',arch);
  }finally{if(temporary)await fs.rm(temporary,{recursive:true,force:true});}
}
if(require.main===module)run(process.argv[2],process.argv.slice(3)).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={configuration};
