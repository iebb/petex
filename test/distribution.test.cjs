const {test}=require('node:test'),assert=require('node:assert/strict');
const {configuration}=require('../scripts/distribution.cjs');
test('unsigned packaging stays available and signing is explicitly credential-gated',()=>{
  assert.equal(configuration('mac',{}).config.mac.identity,null);assert.equal(configuration('win',{}).signed,false);
  assert.throws(()=>configuration('mac',{MAC_CSC_LINK:'private-certificate'}),/notarization credentials/);
  const mac=configuration('mac',{MAC_CSC_LINK:'private-certificate',APPLE_API_KEY_CONTENT:'private-key',APPLE_API_KEY_ID:'key',APPLE_API_ISSUER:'issuer'});
  assert.equal(mac.signed,true);assert.equal(mac.config.forceCodeSigning,true);assert.equal(mac.config.mac.identity,undefined);assert.equal(mac.config.mac.notarize,true);assert.equal(mac.config.mac.hardenedRuntime,true);
  assert.equal(configuration('win',{WIN_CSC_LINK:'private-certificate'}).config.forceCodeSigning,true);
});
