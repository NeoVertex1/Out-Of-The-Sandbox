import { execFileSync } from 'node:child_process';
import { prepareVmBase, vmHealth } from '../server/vm-sandbox.ts';
const health = await vmHealth();
console.log(health.message);
if (!health.available) process.exit(1);
await prepareVmBase(phase => console.log(`${phase}...`));
execFileSync(process.execPath, ['--import', 'tsx', 'scripts/verify-vm.ts'], { stdio: 'inherit', timeout: 300000 });
console.log(execFileSync('node_modules/.bin/codex', ['--version'], { encoding: 'utf8' }).trim());
console.log('Ready for a real provider. Connect your account in Settings.');
