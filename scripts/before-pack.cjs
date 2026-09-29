const fs = require('node:fs');
const path = require('node:path');
const {Arch} = require('builder-util');
module.exports = async context => {
  const arch = Arch[context.arch];
  const platform = context.electronPlatformName === 'mas' ? 'darwin' : context.electronPlatformName;
  require('./build-native.cjs').build(platform, arch);
  const packageName = `@img/sharp-${platform}-${arch}`;
  if (!fs.existsSync(path.join(context.packager.info.appDir, 'node_modules', packageName, 'package.json'))) {
    throw new Error(`Missing ${packageName}. Before cross-packaging, run npm install --no-save --os=${platform} --cpu=${arch} sharp. Build on the target OS in CI for native verification.`);
  }
};
