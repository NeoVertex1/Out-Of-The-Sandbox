#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
name="oots-smoke-$$"
trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT
echo 'Checking gVisor, offline networking, and workspace IPC…'
result="$(docker run --name "$name" --runtime=runsc --network=none --read-only --cap-drop=ALL --security-opt=no-new-privileges --pids-limit=32 --memory=128m --cpus=.5 --tmpfs /workspace:rw,noexec,nosuid,nodev,size=8m,uid=10001,gid=10001,mode=0700 -i oots-worker:local <<'REQUESTS'
{"id":1,"op":"init","files":{"notes/notebook.md":"Smoke test","HANDOFF.md":"Retained record"}}
{"id":2,"op":"read_file","path":"HANDOFF.md"}
{"id":3,"op":"read_file","path":"/etc/passwd"}
REQUESTS
)"
printf '%s\n' "$result" | python3 -c 'import sys,json; rows=[json.loads(x) for x in sys.stdin]; assert len(rows)==3; assert rows[0]["result"]["ready"] is True; assert rows[1]["result"]=="Retained record"; assert "error" in rows[2]; print("Workspace operations and path denial verified.")'
test "$(docker inspect --format '{{.HostConfig.Runtime}} {{.HostConfig.NetworkMode}} {{.HostConfig.ReadonlyRootfs}} {{.State.ExitCode}}' "$name")" = 'runsc none true 0'
echo 'gVisor workspace smoke check passed.'
