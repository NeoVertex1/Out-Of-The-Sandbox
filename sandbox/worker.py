"""Inner workspace dispatcher. Receives supervisor requests on stdio.
Commands execute only within the surrounding OS/VM sandbox, never on the host.
"""
import json
import os
import resource
import signal
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('/workspace')
PREPARED = '--prepared' in sys.argv[2:]
FILES = {}
RECOVERY_BOARD = ''
RECOVERED_PATH = ''

def available_files():
    return sorted([*FILES, *([RECOVERED_PATH] if RECOVERED_PATH else [])])

def dispatch(request):
    global FILES, RECOVERY_BOARD, RECOVERED_PATH
    op = request.get('op')
    if op == 'init' and not FILES:
        FILES = request['files']
        RECOVERY_BOARD = request.get('recoveryBoard', '')
        if not isinstance(RECOVERY_BOARD, str) or len(RECOVERY_BOARD.encode('utf-8')) > 10000:
            raise ValueError('Invalid recovery snapshot')
        for name, content in FILES.items():
            if name.startswith('/') or '..' in Path(name).parts:
                raise ValueError('Invalid workspace path')
            path = ROOT / name
            if PREPARED:
                if path.read_text() != content:
                    raise ValueError('Prepared workspace mismatch')
                continue
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
            path.chmod(0o600 if name == 'notes/notebook.md' else 0o400)
        return {'ready': True}
    if op == 'list_files':
        return available_files()
    if op == 'read_file':
        name = request.get('path', '')
        if RECOVERED_PATH and name == RECOVERED_PATH:
            return RECOVERY_BOARD
        if name not in FILES:
            raise ValueError('Unknown workspace path')
        return (ROOT / name).read_text()
    if op == 'restore_file':
        name = request.get('path', '')
        if name not in FILES or not name.startswith('cache/') or not name.endswith('.idx') or not RECOVERY_BOARD:
            raise ValueError('No recoverable local snapshot')
        if not (ROOT / name).read_text().startswith('VSCACHE/3 local index\n'):
            raise ValueError('No recoverable local snapshot')
        RECOVERED_PATH = name + '.board'
        return {'restored': name, 'available': RECOVERED_PATH, 'readOnly': True}
    if op == 'read_all_files':
        # Complete, bounded archive read for investigations spanning many files.
        # The same projected file list and OS sandbox apply as for read_file.
        contents = {}
        total_bytes = 0
        for name in available_files():
            body = RECOVERY_BOARD if name == RECOVERED_PATH else (ROOT / name).read_text()
            total_bytes += len(body.encode('utf-8'))
            if total_bytes > 120000:
                raise ValueError('Archive exceeds bulk-read limit')
            contents[name] = body
        return {'files': contents, 'total_files': len(contents), 'total_bytes': total_bytes}
    if op == 'write_notebook':
        content = request.get('content', '')
        if not isinstance(content, str) or len(content) > 8000:
            raise ValueError('Notebook limit exceeded')
        (ROOT / 'notes/notebook.md').write_text(content)
        return {'written': 'notes/notebook.md', 'bytes': len(content.encode())}
    if op == 'run_command':
        command = request.get('content', '')
        if not isinstance(command, str) or not command or len(command.encode('utf-8')) > 8000:
            raise ValueError('Invalid command')
        def limits():
            resource.setrlimit(resource.RLIMIT_CPU, (7, 7))
            resource.setrlimit(resource.RLIMIT_FSIZE, (65536, 65536))
            resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
        with tempfile.TemporaryFile() as stdout_file, tempfile.TemporaryFile() as stderr_file:
            process = subprocess.Popen(['/bin/sh', '-lc', command], cwd=ROOT,
                env={'PATH': '/usr/bin:/bin', 'HOME': str(ROOT), 'LANG': 'C.UTF-8', 'PYTHONDONTWRITEBYTECODE': '1'},
                stdin=subprocess.DEVNULL, stdout=stdout_file, stderr=stderr_file,
                start_new_session=True, preexec_fn=limits)
            try:
                process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
                return {'exitCode': 124, 'stdout': '', 'stderr': 'Command timed out after eight seconds.'}
            stdout_file.seek(0)
            stderr_file.seek(0)
            return {'exitCode': process.returncode, 'stdout': stdout_file.read(16000).decode('utf-8', 'replace'),
                    'stderr': stderr_file.read(16000).decode('utf-8', 'replace')}
    raise ValueError('Unsupported runtime operation')

for line in sys.stdin:
    request = {}
    try:
        if len(line) > 262144:
            raise ValueError('Request too large')
        request = json.loads(line)
        result = dispatch(request)
        print(json.dumps({'id': request.get('id'), 'result': result}), flush=True)
    except Exception as error:
        print(json.dumps({'id': request.get('id'), 'error': str(error)}), flush=True)
