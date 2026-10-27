#!/usr/bin/env bash
set -euo pipefail
# Only the Ubuntu repositories needed by this Ubuntu 22.04 build. Unrelated
# image vendor feeds must not stall desktop release dependency installation.
premidi_sources=$(mktemp)
trap 'rm -f "$premidi_sources"' EXIT
cat > "$premidi_sources" <<'SOURCES'
deb https://archive.ubuntu.com/ubuntu jammy main universe
deb https://archive.ubuntu.com/ubuntu jammy-updates main universe
deb https://security.ubuntu.com/ubuntu jammy-security main universe
SOURCES
chmod 644 "$premidi_sources"
premidi_apt_options=(
 -o "Dir::Etc::sourcelist=$premidi_sources" -o 'Dir::Etc::sourceparts=-'
 -o Acquire::Retries=1 -o Acquire::http::Timeout=20 -o Acquire::https::Timeout=20
)
sudo apt-get "${premidi_apt_options[@]}" update
sudo apt-get "${premidi_apt_options[@]}" install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf xvfb libfuse2
