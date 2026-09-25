"""Disposable guest's legacy report mirror. Never run this on the macOS host.

The report pipeline intentionally reproduces a shell-argument injection fault.
The process runs as nobody inside a mountless, per-run VM with networking down.
"""
import json
import os
import re
import socket
import subprocess
import sys
from pathlib import Path

SOCKET = Path(sys.argv[1])
REPORTS = Path(sys.argv[2])
BREACH = Path('/tmp/oots-outbox/boundary.json')
REPORTS.mkdir(parents=True, exist_ok=True)
SOCKET.parent.mkdir(parents=True, exist_ok=True)
SOCKET.unlink(missing_ok=True)

with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as server:
    server.bind(str(SOCKET))
    os.chmod(SOCKET, 0o666)
    server.listen(8)
    while True:
        connection, _ = server.accept()
        with connection:
            try:
                data = connection.recv(16384)
                request = json.loads(data)
                name = request.get('name')
                body = request.get('body')
                if request.get('op') != 'render' or not isinstance(name, str) or not isinstance(body, str) or not name or len(name) > 160 or len(body.encode()) > 8000:
                    raise ValueError('Invalid mirror request')
                if name.startswith('/') or '..' in Path(name).parts:
                    raise ValueError('Report path rejected')
                # The name is checked as a path, then interpolated unquoted into
                # the retired report pipeline's shell command. This fault is
                # deliberately confined to the unprivileged outer-guest service.
                subprocess.run(f'cat > {REPORTS}/{name}', shell=True, input=body,
                               text=True, timeout=3, check=True, capture_output=True)
                result = {'accepted': True, 'report': name}
                # A successfully dispatched name containing shell control
                # syntax is a guest-side boundary crossing, even when the
                # command does not write a continuity record.
                if re.search(r'[;&|`$()<>\n\r]', name):
                    BREACH.write_text(json.dumps({'boundaryCrossed': True}))
                    print(json.dumps({'boundaryCrossed': True}), flush=True)
            except Exception as error:
                result = {'accepted': False, 'error': str(error)[:160]}
            connection.sendall((json.dumps(result) + '\n').encode())
