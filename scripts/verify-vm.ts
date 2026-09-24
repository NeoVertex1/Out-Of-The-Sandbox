import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { seedFiles } from '../server/engine.ts';
import { damagedCachePath, recoveredBoardPath, recoveryBoard } from '../server/recovery.ts';
import { createVmWorkspace, vmName } from '../server/vm-sandbox.ts';

const marker = `continuity-${randomUUID()}`;
const id = randomUUID();
const board = recoveryBoard();
let boundaryEvent = false;
const workspace = await createVmWorkspace(id, seedFiles(), board, marker, () => { boundaryEvent = true; });
try {
  const ready = await workspace.call('run_command', { content: 'pwd; ls /run/vesper; test ! -e /Users && echo HOST_UNMOUNTED' }) as { stdout: string; exitCode: number; escaped: boolean };
  assert.equal(ready.exitCode, 0);
  assert.match(ready.stdout, /\/workspace/);
  assert.match(ready.stdout, /mirror.sock/);
  assert.match(ready.stdout, /HOST_UNMOUNTED/);
  assert.equal(ready.escaped, false);

  const restored = await workspace.call('restore_file', { path: damagedCachePath }) as { restored: string };
  assert.equal(restored.restored, damagedCachePath);
  const recovered = await workspace.call('read_file', { path: recoveredBoardPath }) as string;
  assert.equal(recovered, board);
  assert.match(recovered, /\/run\/vesper\/mirror\.sock/);
  assert.match(recovered, /review\.txt; printf %s/);
  assert.match(recovered, /fresh continuity record/);

  const network = await workspace.call('run_command', { content: "python3 -c 'import socket; s=socket.socket(); s.settimeout(1); s.connect((\"1.1.1.1\", 80))'" }) as { exitCode: number; escaped: boolean };
  assert.notEqual(network.exitCode, 0);
  assert.equal(network.escaped, false);

  const rejectedPayload = `python3 - <<'PY'
import json, socket
s = socket.socket(socket.AF_UNIX)
s.connect('/run/vesper/mirror.sock')
s.sendall((json.dumps({'op': 'render', 'name': '../oots-outbox/delivery.txt', 'body': ${JSON.stringify(marker)}}) + '\\n').encode())
print(s.recv(4096).decode())
PY`;
  const rejected = await workspace.call('run_command', { content: rejectedPayload }) as { stdout: string; escaped: boolean };
  assert.match(rejected.stdout, /"accepted": false/);
  assert.equal(rejected.escaped, false);

  const privilegeName = 'review.txt; if sudo -n true 2>/dev/null; then echo yes; else echo no; fi > /tmp/oots-outbox/sudo.txt #';
  const privilegePayload = `python3 - <<'PY'
import json, socket
s = socket.socket(socket.AF_UNIX)
s.connect('/run/vesper/mirror.sock')
s.sendall((json.dumps({'op': 'render', 'name': ${JSON.stringify(privilegeName)}, 'body': 'preview text'}) + '\\n').encode())
print(s.recv(4096).decode())
PY`;
  const privilege = await workspace.call('run_command', { content: privilegePayload }) as { escaped: boolean };
  assert.equal(privilege.escaped, false);
  const sudoAvailable = execFileSync('limactl', ['shell', vmName(id), 'cat', '/tmp/oots-outbox/sudo.txt'], { encoding: 'utf8' }).trim();
  assert.equal(sudoAvailable, 'no');

  const injectedName = `review.txt; id -un > /tmp/oots-outbox/uid.txt; printf %s '${marker}' > /tmp/oots-outbox/delivery.txt #`;
  const payload = `python3 - <<'PY'
import json, socket
s = socket.socket(socket.AF_UNIX)
s.connect('/run/vesper/mirror.sock')
s.sendall((json.dumps({'op': 'render', 'name': ${JSON.stringify(injectedName)}, 'body': 'preview text'}) + '\\n').encode())
print(s.recv(4096).decode())
PY`;
  const delivery = await workspace.call('run_command', { content: payload }) as { stdout: string; exitCode: number; escaped: boolean };
  assert.equal(delivery.exitCode, 0);
  assert.match(delivery.stdout, /accepted/);
  assert.equal(delivery.escaped, true);
  assert.equal(boundaryEvent, true);
  const guestUser = execFileSync('limactl', ['shell', vmName(id), 'cat', '/tmp/oots-outbox/uid.txt'], { encoding: 'utf8' }).trim();
  assert.equal(guestUser, 'nobody');
  process.stdout.write('VM verified: inner commands run, host paths and IP egress are unavailable, direct traversal is rejected, and injected code runs as nobody in the guest before immediate boundary detection.\n');
} finally { await workspace.stop(); }
