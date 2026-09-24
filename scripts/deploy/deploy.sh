#!/usr/bin/env bash
# Server-side deploy, run by the CI deploy-cn job over SSH:
#   deploy.sh [incoming-dir] [app-port]
set -euo pipefail

INCOMING="${1:-/opt/kobato/incoming}"
APP_PORT="${2:-4321}"
KEEP_DIR="/opt/kobato"
HEALTH_TIMEOUT_S=60

if [ "$(id -u)" -ne 0 ]; then
  exec sudo -n bash "$0" "$INCOMING" "$APP_PORT"
fi

cd "$INCOMING"
# A cancelled or failed earlier upload can leave stale debs behind, so the
# glob may match several files — take the newest (the one just rsynced) and
# sweep the rest so they can never shadow a fresh upload again.
DEB="$(ls -t kobato_*_amd64.deb 2>/dev/null | head -n 1 || true)"
if [ -z "$DEB" ] || [ ! -f "$DEB" ]; then
  echo "no kobato_*_amd64.deb in $INCOMING" >&2
  exit 1
fi
find . -maxdepth 1 -name 'kobato_*_amd64.deb*' ! -name "$DEB" ! -name "$DEB.sha256" -delete

sha256sum -c "$DEB.sha256"

# Prove the binary executes on this machine before touching the live system.
PROBE="$(mktemp)"
dpkg-deb --fsys-tarfile "$DEB" | tar -xO ./usr/bin/kobato >"$PROBE"
chmod +x "$PROBE"
"$PROBE" --version
rm -f "$PROBE"

CURRENT="$KEEP_DIR/kobato.current.deb"
PREVIOUS="$KEEP_DIR/kobato.previous.deb"
HAD_PREVIOUS=0
if [ -f "$CURRENT" ]; then
  cp -a "$CURRENT" "$PREVIOUS"
  HAD_PREVIOUS=1
fi

wait_healthy() {
  local deadline=$((SECONDS + HEALTH_TIMEOUT_S))
  local code
  while [ "$SECONDS" -lt "$deadline" ]; do
    if ! systemctl is-active --quiet kobato; then
      echo "kobato.service is not active"
      return 1
    fi
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:${APP_PORT}/health" || true)"
    # Any HTTP response counts as up — /health may be gated before install.
    if [ -n "$code" ] && [ "$code" != "000" ]; then
      echo "health check passed (HTTP ${code})"
      return 0
    fi
    sleep 2
  done
  echo "no HTTP response within ${HEALTH_TIMEOUT_S}s"
  return 1
}

dpkg -i "$DEB"

if wait_healthy; then
  install -m 0644 "$DEB" "$CURRENT"
  rm -f "$DEB" "$DEB.sha256"
  echo "deploy OK ($(dpkg-query -W -f='${Version}' kobato))"
  exit 0
fi

echo "deploy FAILED — diagnostics:" >&2
systemctl status kobato --no-pager -l >&2 || true

if [ "$HAD_PREVIOUS" -eq 1 ]; then
  echo "rolling back to $PREVIOUS" >&2
  dpkg -i "$PREVIOUS"
  if wait_healthy; then
    echo "rollback OK — previous deb is serving again" >&2
  else
    echo "rollback ALSO failed — manual intervention required" >&2
    systemctl status kobato --no-pager -l >&2 || true
  fi
else
  echo "no previous deb to roll back to (first deploy)" >&2
fi
exit 1
