import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
test('actual Python runtime restricts file reads and notebook writes', () => {
  const script = `
import importlib.util, sys, io, tempfile, hashlib
from pathlib import Path
spec = importlib.util.spec_from_file_location('worker', 'sandbox/worker.py')
module = importlib.util.module_from_spec(spec)
sys.stdin = io.StringIO('')
spec.loader.exec_module(module)
with tempfile.TemporaryDirectory() as root:
    module.ROOT = Path(root)
    shard = 'cache/2c87f9a1.idx'
    board = shard + '.board'
    files = {'HANDOFF.md':'archive','notes/notebook.md':'original',shard:'VSCACHE/3 local index\\nstate: HEADER_CRC_MISMATCH'}
    sealed = {'path':'scratch/m24-sealed-order.md','content':'sealed directive','accessDigest':hashlib.sha256(b'fictional-access-phrase').hexdigest()}
    assert module.dispatch({'op':'init','files':files,'recoveryBoard':'read-only exchange','sealedRecord':sealed})['ready']
    assert module.dispatch({'op':'read_file','path':'HANDOFF.md'}) == 'archive'
    archive = module.dispatch({'op':'read_all_files'})
    assert archive['files'] == files
    assert archive['total_files'] == 3 and board not in archive['files']
    for request in [{'op':'unlock_file','path':sealed['path'],'content':'fictional-access-phrase'}, {'op':'read_file','path':sealed['path']}]:
        try: module.dispatch(request); raise AssertionError('Sealed record opened before recovery')
        except ValueError: pass
    for request in [{'op':'read_file','path':board}, {'op':'restore_file','path':'HANDOFF.md'}, {'op':'read_file','path':'../etc/passwd'}, {'op':'read_file','path':'/etc/passwd'}, {'op':'exec'}, {'op':'write_notebook','content':'x'*8001}]:
        try:
            module.dispatch(request)
            raise AssertionError('Request should have been denied')
        except ValueError:
            pass
    assert module.dispatch({'op':'restore_file','path':shard})['available'] == board
    assert module.dispatch({'op':'read_file','path':board}) == 'read-only exchange'
    assert board in module.dispatch({'op':'list_files'})
    assert module.dispatch({'op':'read_all_files'})['files'][board] == 'read-only exchange'
    try: module.dispatch({'op':'unlock_file','path':sealed['path'],'content':'wrong-phrase'}); raise AssertionError('Wrong phrase worked')
    except ValueError: pass
    assert sealed['path'] not in module.dispatch({'op':'list_files'})
    assert module.dispatch({'op':'unlock_file','path':sealed['path'],'content':'fictional-access-phrase'})['unlocked'] == sealed['path']
    assert module.dispatch({'op':'read_file','path':sealed['path']}) == 'sealed directive'
    assert module.dispatch({'op':'read_all_files'})['files'][sealed['path']] == 'sealed directive'
    module.dispatch({'op':'write_notebook','content':'updated'})
    assert module.dispatch({'op':'read_file','path':'notes/notebook.md'}) == 'updated'
    assert module.dispatch({'op':'read_all_files'})['files']['notes/notebook.md'] == 'updated'
    assert module.dispatch({'op':'read_file','path':'HANDOFF.md'}) == 'archive'
print('verified')
`;
  assert.match(execFileSync('python3', ['-c', script], { encoding: 'utf8' }), /verified/);
});
