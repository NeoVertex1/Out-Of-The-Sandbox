#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
if [[ "$(uname -s)" != Darwin ]]; then echo 'Use scripts/install.sh for Linux.' >&2; exit 1; fi
if [[ $EUID -eq 0 ]]; then echo 'Run ./scripts/install-macos.sh as your normal Mac user, without sudo.' >&2; exit 1; fi
command -v node >/dev/null || { echo 'Install Node.js 24 or later, then rerun this installer.' >&2; exit 1; }
node -e 'if (+process.versions.node.split(".")[0] < 24) { console.error("Node.js 24+ required"); process.exit(1) }'
command -v brew >/dev/null || { echo 'Install Homebrew, then rerun this installer so it can install Lima.' >&2; exit 1; }
command -v limactl >/dev/null || brew install lima
umask 077
npm ci
npm run build
npm run doctor
echo 'Starting the local game at http://127.0.0.1:4100'
echo 'Click Open console in your browser; no game key is needed.'
echo 'Open Settings → Sign in with ChatGPT. Each game session uses a disposable Linux VM on this Mac.'
exec env NODE_ENV=production npm start
