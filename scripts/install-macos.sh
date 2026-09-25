#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
if [[ "$(uname -s)" != Darwin ]]; then echo 'Use scripts/install.sh for Linux.' >&2; exit 1; fi
if [[ $EUID -eq 0 ]]; then echo 'Run ./Install.command as your normal Mac user, without sudo.' >&2; exit 1; fi
if ! command -v brew >/dev/null; then
  echo 'Installing Homebrew to manage Node.js and Lima...'
  /bin/bash -c "$(curl --fail --show-error --silent --location https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi
if [[ -x /opt/homebrew/bin/brew ]]; then eval "$(/opt/homebrew/bin/brew shellenv)"; fi
if [[ -x /usr/local/bin/brew ]]; then eval "$(/usr/local/bin/brew shellenv)"; fi
command -v brew >/dev/null || { echo 'Homebrew installation did not complete. Rerun this installer after resolving its prompt.' >&2; exit 1; }
if ! command -v node >/dev/null || ! node -e 'process.exit(+process.versions.node.split(".")[0] >= 24 ? 0 : 1)'; then
  echo 'Installing Node.js 24 or later...'
  brew install node
fi
export PATH="$(brew --prefix)/bin:$PATH"
node -e 'if (+process.versions.node.split(".")[0] < 24) { console.error("Node.js 24+ required"); process.exit(1) }'
if ! command -v limactl >/dev/null; then echo 'Installing Lima...'; brew install lima; fi
if ! command -v ftts >/dev/null; then echo 'Installing franken_tts for local speech...'; brew install dicklesworthstone/tap/franken-tts; fi
if ! command -v ffmpeg >/dev/null; then echo 'Installing ffmpeg for streamed audio...'; brew install ffmpeg; fi
umask 077
if [[ -f RELEASE-BUNDLE ]]; then
  bundle_version="$(cat RELEASE-BUNDLE)"
  package_version="$(node -p 'require("./package.json").version')"
  [[ "$bundle_version" == "$package_version" ]] || { echo 'Release bundle version does not match package.json.' >&2; exit 1; }
  npm ci --omit=dev
else
  npm ci
  npm run build
fi
npm run prepare:vm
# franken_tts streams speech locally. Its built-in matt voice needs no enrollment.
ftts pull
ftts say --profile interactive --voice matt --check 'Speech setup check' >/dev/null
reference_voice='assets/voice/phil-chenevert-reference.wav'
[[ -f "$reference_voice" ]] || { echo "Bundled voice reference is missing: $reference_voice" >&2; exit 1; }
ftts say --profile interactive --voice "$reference_voice" --check 'Speech setup check' >/dev/null
echo 'franken_tts and both the default and bundled reference voices are ready.'
npm run doctor
if [[ ${OOTS_INSTALL_NO_START:-} == 1 ]]; then echo 'Installation verified. Run ./Play.command to start the game.'; exit 0; fi
echo 'Starting the local game at http://127.0.0.1:4100'
echo 'Click Open console in your browser; no game key is needed.'
echo 'Open Settings → Sign in with ChatGPT. Each game session uses a disposable Linux VM on this Mac.'
exec bash scripts/run-macos.sh
