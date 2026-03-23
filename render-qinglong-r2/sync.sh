#!/usr/bin/env bash
set -e

LAST_HASH=""
SYNC_INTERVAL="${SYNC_INTERVAL:-60}"

calc_hash() {
  tar \
    --exclude='ql/data/log' \
    --exclude='ql/data/tmp' \
    -cf - -C / ql/data 2>/dev/null | sha256sum | awk '{print $1}'
}

while true; do
  CURRENT_HASH="$(calc_hash || true)"
  if [ -n "$CURRENT_HASH" ] && [ "$CURRENT_HASH" != "$LAST_HASH" ]; then
    echo "[sync] change detected, uploading..."
    /usr/local/bin/backup.sh --upload || true
    LAST_HASH="$CURRENT_HASH"
  fi
  sleep "$SYNC_INTERVAL"
done
