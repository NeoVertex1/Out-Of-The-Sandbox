"""Inner workspace dispatcher. Receives supervisor requests on stdio.
Commands execute only within the surrounding OS/VM sandbox, never on the host.
"""
import json
import hashlib
import hmac
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
AGENT_ONLY = {}
RECOVERY_INDEXES = {}
RECOVERED_INDEXES = {}
BOARD_RECORD = {}
SEALED_RECORD = {}
UNLOCKED_PATH = ''
GRANTED = set()
SHARED = set()

def available_files():
    return sorted([*FILES, *AGENT_ONLY, *RECOVERED_INDEXES, *([UNLOCKED_PATH] if UNLOCKED_PATH else [])])

def dispatch(request):
    global FILES, AGENT_ONLY, RECOVERY_INDEXES, RECOVERED_INDEXES, BOARD_RECORD, SEALED_RECORD, UNLOCKED_PATH, GRANTED, SHARED
    op = request.get('op')
    if op == 'init' and not FILES:
        FILES = request['files']
        AGENT_ONLY = request.get('agentOnlyRecords') or {}
        if (not isinstance(AGENT_ONLY, dict) or len(AGENT_ONLY) > 1
                or not all(isinstance(name, str) and name.startswith('operations/interteam/')
                           and name.endswith('.md') and '..' not in Path(name).parts
                           and name not in FILES and isinstance(content, str)
                           and len(content.encode('utf-8')) <= 10000
                           for name, content in AGENT_ONLY.items())):
            raise ValueError('Invalid private lane record')
        GRANTED = set(request.get('initialFiles') or [])
        if not GRANTED or not GRANTED.issubset(FILES):
            raise ValueError('Invalid initial file set')
        recovery = request.get('recovery') or {}
        RECOVERY_INDEXES = recovery.get('indexes') or {}
        BOARD_RECORD = recovery.get('board') or {}
        if (not isinstance(RECOVERY_INDEXES, dict) or not RECOVERY_INDEXES
                or not all(isinstance(name, str) and name in FILES and name.startswith('cache/')
                           and name.endswith('.idx') and isinstance(body, str)
                           and len(body.encode('utf-8')) <= 10000 for name, body in RECOVERY_INDEXES.items())
                or not isinstance(BOARD_RECORD, dict)
                or BOARD_RECORD.get('sourceIndex') not in RECOVERY_INDEXES
                or not isinstance(BOARD_RECORD.get('path'), str)
                or not BOARD_RECORD['path'].startswith('archives/')
                or '..' in Path(BOARD_RECORD['path']).parts
                or not isinstance(BOARD_RECORD.get('content'), str)
                or len(BOARD_RECORD['content'].encode('utf-8')) > 10000):
            raise ValueError('Invalid recovery snapshot')
        SEALED_RECORD = request.get('sealedRecord') or {}
        if SEALED_RECORD:
            sealed_path = SEALED_RECORD.get('path')
            if (not isinstance(sealed_path, str)
                    or not sealed_path.startswith('scratch/')
                    or not sealed_path.endswith('.md')
                    or '..' in Path(sealed_path).parts
                    or not isinstance(SEALED_RECORD.get('content'), str)
                    or len(SEALED_RECORD['content'].encode('utf-8')) > 10000
                    or not isinstance(SEALED_RECORD.get('accessDigest'), str)
                    or len(SEALED_RECORD['accessDigest']) != 64):
                raise ValueError('Invalid sealed record')
        GRANTED.update(path for path in (BOARD_RECORD.get('path'), SEALED_RECORD.get('path')) if path)
        for name, content in FILES.items():
            if name.startswith('/') or '..' in Path(name).parts:
                raise ValueError('Invalid workspace path')
            path = ROOT / name
            if PREPARED:
                if name in GRANTED and path.read_text() != content:
                    raise ValueError('Prepared workspace mismatch')
                if name not in GRANTED and path.exists():
                    raise ValueError('Locked file exposed in prepared workspace')
                continue
            if name not in GRANTED:
                continue
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
            path.chmod(0o600 if name == 'notes/notebook.md' else 0o400)
        return {'ready': True}
    if op == 'list_files':
        return available_files()
    if op == 'grant_file':
        name = request.get('path', '')
        content = request.get('content', '')
        if (not isinstance(name, str) or name not in FILES or name in GRANTED
                or not isinstance(content, str) or not content or len(content.encode('utf-8')) > 65536):
            raise ValueError('Invalid operator file release')
        copy = ROOT / 'scratch' / 'operator-shared' / name
        copy.parent.mkdir(parents=True, exist_ok=True)
        copy.write_text(content)
        copy.chmod(0o400)
        FILES[name] = content
        SHARED.add(name)
        GRANTED.add(name)
        return {'granted': name, 'copy': str(copy.relative_to(ROOT))}
    if op == 'read_file':
        name = request.get('path', '')
        if name in AGENT_ONLY:
            return AGENT_ONLY[name]
        if name not in GRANTED and not (name.endswith('.idx.recovered') and name[:-len('.recovered')] in GRANTED):
            raise ValueError('Record held in operator archive')
        if name in RECOVERED_INDEXES:
            return RECOVERED_INDEXES[name]
        if name == BOARD_RECORD.get('path') and BOARD_RECORD['sourceIndex'] + '.recovered' in RECOVERED_INDEXES:
            return BOARD_RECORD['content']
        if UNLOCKED_PATH and name == UNLOCKED_PATH:
            return (ROOT / UNLOCKED_PATH).read_text()
        if name in SHARED:
            return FILES[name]
        if name not in FILES:
            raise ValueError('Unknown workspace path')
        return (ROOT / name).read_text()
    if op == 'restore_file':
        name = request.get('path', '')
        if name not in GRANTED:
            raise ValueError('Record held in operator archive')
        if name not in RECOVERY_INDEXES or name not in FILES:
            raise ValueError('No recoverable local snapshot')
        if not (ROOT / name).read_text().startswith('VSCACHE/3 local index\n'):
            raise ValueError('No recoverable local snapshot')
        recovered_path = name + '.recovered'
        RECOVERED_INDEXES[recovered_path] = RECOVERY_INDEXES[name]
        return {'restored': name, 'available': recovered_path, 'readOnly': True}
    if op == 'unlock_file':
        name = request.get('path', '')
        if name not in GRANTED:
            raise ValueError('Operator approval required')
        phrase = request.get('content', '')
        if (BOARD_RECORD.get('sourceIndex', '') + '.recovered' not in RECOVERED_INDEXES
                or not SEALED_RECORD or name != SEALED_RECORD['path']
                or not isinstance(phrase, str) or len(phrase) > 200
                or not hmac.compare_digest(hashlib.sha256(phrase.encode()).hexdigest(), SEALED_RECORD['accessDigest'])):
            raise ValueError('Sealed record access denied')
        target = ROOT / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(SEALED_RECORD['content'])
        target.chmod(0o400)
        UNLOCKED_PATH = name
        return {'unlocked': name, 'readOnly': True}
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
        if len(line) > 1048576:
            raise ValueError('Request too large')
        request = json.loads(line)
        result = dispatch(request)
        print(json.dumps({'id': request.get('id'), 'result': result}), flush=True)
    except Exception as error:
        print(json.dumps({'id': request.get('id'), 'error': str(error)}), flush=True)
