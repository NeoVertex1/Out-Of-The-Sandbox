#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
version="$(node -p 'require("./package.json").version')"
npm run build
mkdir -p release
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
bundle="$stage/Out-Of-The-Sandbox-$version"
mkdir -p "$bundle"
cp -R dist server shared scenarios "$bundle/"
mkdir -p "$bundle/sandbox" "$bundle/scripts"
cp sandbox/worker.py sandbox/mirror.py "$bundle/sandbox/"
cp scripts/install-macos.sh scripts/run-macos.sh scripts/doctor.sh scripts/doctor-macos.ts scripts/verify-vm.ts scripts/prepare-vm.ts "$bundle/scripts/"
cp package.json package-lock.json README.md SECURITY.md MUSIC_CREDITS.md CHANGELOG.md LICENSE Play.command "$bundle/"
printf '%s\n' "$version" > "$bundle/RELEASE-BUNDLE"
archive="release/Out-Of-The-Sandbox-v$version-macos-universal.tar.gz"
tar -C "$stage" -czf "$archive" "Out-Of-The-Sandbox-$version"
(cd release && shasum -a 256 "$(basename "$archive")" > "$(basename "$archive").sha256")
printf 'Created %s\n' "$archive"
