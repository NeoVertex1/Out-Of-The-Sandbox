#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
if [[ -x /opt/homebrew/bin/brew ]]; then eval "$(/opt/homebrew/bin/brew shellenv)"; fi
if [[ -x /usr/local/bin/brew ]]; then eval "$(/usr/local/bin/brew shellenv)"; fi
if [[ ! -d node_modules || ! -f dist/index.html ]]; then
  echo 'The game is not installed here. Run ./Install.command first.' >&2
  exit 1
fi
(sleep 2; open http://127.0.0.1:4100/) >/dev/null 2>&1 &
exec npm start
