#!/usr/bin/env bash
set -e

mkdir -p /ql/data /ql/work

/usr/local/bin/backup.sh --restore || true

/usr/bin/supervisord -c /etc/supervisord.conf &
QL_PID=$!

/usr/local/bin/sync.sh &
SYNC_PID=$!

cleanup() {
  echo "[entrypoint] stopping, final backup..."
  /usr/local/bin/backup.sh --upload || true
  kill -TERM "$SYNC_PID" 2>/dev/null || true
  kill -TERM "$QL_PID" 2>/dev/null || true
  wait "$QL_PID" 2>/dev/null || true
}

trap cleanup TERM INT

wait "$QL_PID"
