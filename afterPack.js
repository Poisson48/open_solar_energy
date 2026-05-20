const path = require('path');
const fs = require('fs');

exports.default = async function(context) {
  if (context.electronPlatformName !== 'linux') return;
  const appOutDir = context.appOutDir;

  // Remove chrome-sandbox (can't have SUID in AppImages)
  const sandboxPath = path.join(appOutDir, 'chrome-sandbox');
  if (fs.existsSync(sandboxPath)) {
    fs.unlinkSync(sandboxPath);
    console.log('  • chrome-sandbox removed');
  }

  // Wrap the electron binary with a script that forces --no-sandbox
  const binPath = path.join(appOutDir, 'open-solar-energy');
  const realBinPath = path.join(appOutDir, 'open-solar-energy.bin');
  fs.renameSync(binPath, realBinPath);

  const wrapper = `#!/bin/bash
exec "$(dirname "$(readlink -f "$0")")/open-solar-energy.bin" --no-sandbox "$@"
`;
  fs.writeFileSync(binPath, wrapper, { mode: 0o755 });
  console.log('  • wrapper --no-sandbox created');
};
