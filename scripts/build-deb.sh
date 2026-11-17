#!/usr/bin/env bash
# Build the kobato deb from a SEA binary (CI runner; dpkg-deb is native on
# ubuntu images).
#   build-deb.sh <sea-binary> <deb-version> <output.deb>
set -euo pipefail

BINARY="${1:?usage: build-deb.sh <sea-binary> <deb-version> <output.deb>}"
VERSION="${2:?}"
OUTPUT="${3:?}"
DEB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/deb"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

install -D -m 0755 "$BINARY" "$STAGE/usr/bin/kobato"
install -D -m 0644 "$DEB_DIR/kobato.service" "$STAGE/lib/systemd/system/kobato.service"

mkdir -p "$STAGE/DEBIAN"
cat >"$STAGE/DEBIAN/control" <<EOF
Package: kobato
Version: ${VERSION}
Section: web
Priority: optional
Architecture: amd64
Maintainer: Kobato CI <noreply@localhost>
Description: Kobato — self-hosted blog server (SEA single executable)
EOF
for script in postinst prerm postrm; do
  install -m 0755 "$DEB_DIR/$script" "$STAGE/DEBIAN/$script"
done

dpkg-deb --build --root-owner-group "$STAGE" "$OUTPUT"
echo "built $OUTPUT"
