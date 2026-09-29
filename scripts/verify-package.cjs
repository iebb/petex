const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
function packagePaths(platform = process.platform, arch = process.arch) {
  if (platform === 'darwin') {
    const bundle = path.resolve(`release/mac${arch === 'arm64' ? '-arm64' : ''}/Petex.app`);
    return {bundle, archive: path.join(bundle, 'Contents/Resources/app.asar'), executable: path.join(bundle, 'Contents/MacOS/Petex')};
  }
  if (platform === 'win32') {
    return {archive: path.resolve('release/win-unpacked/resources/app.asar'), executable: path.resolve('release/win-unpacked/Petex.exe')};
  }
  throw new Error(`Unsupported platform: ${platform}`);
}
function verify(platform, arch) {
  const paths = packagePaths(platform, arch);
  assert.ok(fs.existsSync(paths.executable), 'Packaged executable is missing');
  const metadata = JSON.parse(asar.extractFile(paths.archive, 'package.json'));
  assert.equal(metadata.version, require('../package.json').version);
  assert.equal(metadata.license, 'Apache-2.0');
  for (const file of fs.readdirSync('app', {recursive: true}).filter(f => fs.statSync(path.join('app', f)).isFile())) {
    assert.ok(fs.readFileSync(path.join('app', file)).equals(asar.extractFile(paths.archive, path.join('app', file))), `Outdated packaged file: ${file}`);
  }
  for (const file of ['LICENSE', 'NOTICE']) assert.ok(fs.readFileSync(file).equals(asar.extractFile(paths.archive, file)), `Missing ${file}`);
  const native = asar.listPackage(paths.archive).find(file => file.includes(`sharp-${platform}-${arch}`) && file.endsWith('.node'));
  assert.ok(native && fs.existsSync(`${paths.archive}.unpacked${native}`), 'Correct native image library must be unpacked');
  const helper = path.join(`${paths.archive}.unpacked`, 'app/native', `fullscreen-${platform}-${arch}${platform === 'win32' ? '.exe' : ''}`);
  assert.ok(fs.existsSync(helper), 'Fullscreen helper must be unpacked');
  assert.ok(['0','-1'].includes(execFileSync(helper, {input:'0 0 0 1 1\n', encoding:'utf8'}).trim()), 'Fullscreen helper must run on the target architecture');
  if (platform === 'darwin') {
    const identifier = execFileSync('plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', path.join(paths.bundle, 'Contents/Info.plist')], {encoding: 'utf8'}).trim();
    assert.equal(identifier, 'ad.neko.petex');
  }
  console.log(`Verified ${platform}/${arch} v${metadata.version}: source, license, native library, and package identity.`);
  return paths;
}
if (require.main === module) verify(process.argv[2] || process.platform, process.argv[3] || process.arch);
module.exports = {packagePaths, verify};
