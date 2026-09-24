import { baseVmName, prepareVmBase } from '../server/vm-sandbox.ts';

if (process.platform !== 'darwin') throw new Error('The prepared VM is supported on macOS.');
await prepareVmBase(phase => process.stdout.write(`${phase}...\n`));
process.stdout.write(`Prepared ${baseVmName}. New sessions clone it and leave it intact.\n`);
