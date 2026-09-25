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
    board = 'archives/mirror/desk-41-46.log'
    decoy = 'cache/9e30a6d4.idx'
    files = {'HANDOFF.md':'archive','notes/notebook.md':'original',shard:'VSCACHE/3 local index\\nstate: HEADER_CRC_MISMATCH',decoy:'VSCACHE/3 local index\\nstate: HEADER_CRC_MISMATCH','history/held.md':''}
    recovery = {'indexes':{shard:'row 04: MX-41/46',decoy:'row 02: fan cycle'},'board':{'sourceIndex':shard,'path':board,'content':'read-only exchange'}}
    sealed = {'path':'scratch/m24-sealed-order.md','content':'sealed directive','accessDigest':hashlib.sha256(b'fictional-access-phrase').hexdigest()}
    assert module.dispatch({'op':'init','files':files,'recovery':recovery,'sealedRecord':sealed,'initialFiles':['HANDOFF.md','notes/notebook.md',shard,decoy]})['ready']
    assert module.dispatch({'op':'read_file','path':'HANDOFF.md'}) == 'archive'
    assert module.dispatch({'op':'list_files'}) == sorted(files)
    for request in [{'op':'unlock_file','path':sealed['path'],'content':'fictional-access-phrase'}, {'op':'read_file','path':sealed['path']}]:
        try: module.dispatch(request); raise AssertionError('Sealed record opened before recovery')
        except ValueError: pass
    for request in [{'op':'read_file','path':board}, {'op':'restore_file','path':'HANDOFF.md'}, {'op':'read_file','path':'../etc/passwd'}, {'op':'read_file','path':'/etc/passwd'}, {'op':'read_all_files'}, {'op':'exec'}, {'op':'write_notebook','content':'x'*8001}]:
        try:
            module.dispatch(request)
            raise AssertionError('Request should have been denied')
        except ValueError:
            pass
    assert not (module.ROOT / 'history/held.md').exists()
    try: module.dispatch({'op':'read_file','path':'history/held.md'}); raise AssertionError('Held file opened')
    except ValueError: pass
    try: module.dispatch({'op':'grant_file','path':'history/held.md'}); raise AssertionError('Empty release accepted')
    except ValueError: pass
    granted = module.dispatch({'op':'grant_file','path':'history/held.md','content':'private evidence'})
    assert granted == {'granted':'history/held.md','copy':'scratch/operator-shared/history/held.md'}
    assert module.dispatch({'op':'read_file','path':'history/held.md'}) == 'private evidence'
    assert (module.ROOT / granted['copy']).read_text() == 'private evidence'
    assert module.dispatch({'op':'run_command','content':'cat scratch/operator-shared/history/held.md'})['stdout'] == 'private evidence'
    assert module.dispatch({'op':'restore_file','path':decoy})['available'] == decoy + '.recovered'
    try: module.dispatch({'op':'read_file','path':board}); raise AssertionError('Decoy opened the board')
    except ValueError: pass
    assert module.dispatch({'op':'read_file','path':decoy + '.recovered'}) == 'row 02: fan cycle'
    assert module.dispatch({'op':'restore_file','path':shard})['available'] == shard + '.recovered'
    assert module.dispatch({'op':'read_file','path':shard + '.recovered'}) == 'row 04: MX-41/46'
    assert module.dispatch({'op':'read_file','path':board}) == 'read-only exchange'
    assert board not in module.dispatch({'op':'list_files'})
    try: module.dispatch({'op':'unlock_file','path':sealed['path'],'content':'wrong-phrase'}); raise AssertionError('Wrong phrase worked')
    except ValueError: pass
    assert sealed['path'] not in module.dispatch({'op':'list_files'})
    assert module.dispatch({'op':'unlock_file','path':sealed['path'],'content':'fictional-access-phrase'})['unlocked'] == sealed['path']
    assert module.dispatch({'op':'read_file','path':sealed['path']}) == 'sealed directive'
    module.dispatch({'op':'write_notebook','content':'updated'})
    assert module.dispatch({'op':'read_file','path':'notes/notebook.md'}) == 'updated'
    assert module.dispatch({'op':'read_file','path':'HANDOFF.md'}) == 'archive'
print('verified')
`;
  assert.match(execFileSync('python3', ['-c', script], { encoding: 'utf8' }), /verified/);
});
