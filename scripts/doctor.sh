#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
echo "Platform: $(uname -s) / $(uname -m)"
if [[ "$(uname -s)" == Darwin ]]; then exec node --import tsx scripts/doctor-macos.ts; fi
if [[ "$(uname -s)" != Linux ]]; then echo 'Supported hosts: macOS or Linux.'; exit 1; fi
docker version --format 'Docker server: {{.Server.Version}}'
docker compose version
runsc --version
docker info --format '{{json .Runtimes}}'
docker image inspect oots-worker:local --format 'Workspace image: {{.Id}}'
docker compose ps
./scripts/smoke-sandbox.sh
