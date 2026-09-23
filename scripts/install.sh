#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
if [[ "$(uname -s)" == Darwin ]]; then exec bash scripts/install-macos.sh; fi
if [[ "$(uname -s)" != Linux ]]; then
  echo 'Supported hosts: macOS (native sandbox) or Linux (gVisor).' >&2
  exit 1
fi
if [[ $EUID -ne 0 ]]; then echo 'Run sudo ./scripts/install.sh on your dedicated Linux server.' >&2; exit 1; fi
source /etc/os-release
case "$ID:$VERSION_ID" in ubuntu:22.04|ubuntu:24.04|ubuntu:26.04|debian:12|debian:13) ;; *) echo 'Supported: Ubuntu 22.04/24.04/26.04 or Debian 12/13.' >&2; exit 1 ;; esac
architecture="$(dpkg --print-architecture)"
case "$architecture" in amd64|arm64) ;; *) echo 'Only amd64 and arm64 are supported.' >&2; exit 1 ;; esac
command -v systemctl >/dev/null || { echo 'A systemd Linux host is required.' >&2; exit 1; }
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg openssl python3
if ! command -v docker >/dev/null; then
  # Do not remove or replace an existing container runtime automatically.
  for package in docker.io podman-docker containerd runc; do
    if dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -q 'install ok installed'; then
      echo "Existing $package found. Install Docker Engine using its official instructions, then rerun this installer." >&2; exit 1
    fi
  done
  install -m 0755 -d /etc/apt/keyrings
  curl --fail --show-error --silent --location "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
  chmod 0644 /etc/apt/keyrings/docker.asc
  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/%s %s stable\n' "$architecture" "$ID" "$VERSION_CODENAME" > /etc/apt/sources.list.d/oots-docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
docker compose version >/dev/null || { echo 'Install the official docker-compose-plugin package, then rerun.' >&2; exit 1; }
systemctl enable --now docker
if ! command -v runsc >/dev/null; then
  curl --fail --show-error --silent --location https://gvisor.dev/archive.key | gpg --dearmor --yes -o /usr/share/keyrings/gvisor-archive-keyring.gpg
  chmod 0644 /usr/share/keyrings/gvisor-archive-keyring.gpg
  printf 'deb [arch=%s signed-by=/usr/share/keyrings/gvisor-archive-keyring.gpg] https://storage.googleapis.com/gvisor/releases release main\n' "$architecture" > /etc/apt/sources.list.d/oots-gvisor.list
  apt-get update
  apt-get install -y runsc
fi
# runsc install merges the runtime entry; never replace daemon.json by hand.
if [[ -f /etc/docker/daemon.json ]]; then cp -n /etc/docker/daemon.json /etc/docker/daemon.json.before-oots || true; fi
runsc install
systemctl reload docker
docker run --rm --runtime=runsc --network=none hello-world
umask 077
mkdir -p .data/server
if [[ ! -e .env ]]; then
  printf 'BRIDGE_TOKEN=%s\nPUBLIC_ORIGIN=\nCOOKIE_SECURE=false\n' "$(openssl rand -hex 32)" > .env
fi
chmod 0600 .env
if grep -q '^BRIDGE_TOKEN=replace-' .env; then
  echo 'The .env file still contains the example token. Replace it with 32 random bytes (openssl rand -hex 32) before installing.' >&2
  exit 1
fi
docker build -t oots-worker:local sandbox
docker compose build
docker compose up -d --wait --wait-timeout 180
./scripts/smoke-sandbox.sh
echo 'Installed. Console: http://127.0.0.1:4100'
echo 'From your computer: ssh -L 4100:127.0.0.1:4100 USER@SERVER'
echo 'Click Open console in your browser; no game key is needed.'
echo 'Open Settings to sign in with ChatGPT or configure an API provider.'
