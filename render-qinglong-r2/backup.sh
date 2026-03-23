#!/usr/bin/env bash
set -e

WORK_DIR="/ql/work"
ARCHIVE="${WORK_DIR}/latest.tar.gz"
ENC_ARCHIVE="${WORK_DIR}/latest.tar.gz.enc"
SHA_FILE="${WORK_DIR}/latest.sha256"

: "${R2_ACCESS_KEY_ID:?missing R2_ACCESS_KEY_ID}"
: "${R2_SECRET_ACCESS_KEY:?missing R2_SECRET_ACCESS_KEY}"
: "${R2_ACCOUNT_ID:?missing R2_ACCOUNT_ID}"
: "${R2_BUCKET:?missing R2_BUCKET}"
: "${BACKUP_PASSPHRASE:?missing BACKUP_PASSPHRASE}"

export AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}"
export AWS_DEFAULT_REGION="auto"

S3_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
REMOTE_PREFIX="${R2_PREFIX:-qinglong}"

restore_backup() {
  echo "[restore] checking remote backup..."
  if ! aws s3 ls "s3://${R2_BUCKET}/${REMOTE_PREFIX}/latest.tar.gz.enc" --endpoint-url "${S3_ENDPOINT}" >/dev/null 2>&1; then
    echo "[restore] no backup found"
    return 0
  fi

  aws s3 cp "s3://${R2_BUCKET}/${REMOTE_PREFIX}/latest.tar.gz.enc" "$ENC_ARCHIVE" --endpoint-url "${S3_ENDPOINT}"
  aws s3 cp "s3://${R2_BUCKET}/${REMOTE_PREFIX}/latest.sha256" "$SHA_FILE" --endpoint-url "${S3_ENDPOINT}" || true

  if [ -f "$SHA_FILE" ]; then
    cd "$WORK_DIR"
    sha256sum -c latest.sha256 || {
      echo "[restore] sha256 verify failed"
      exit 1
    }
  fi

  openssl enc -aes-256-cbc -pbkdf2 -d \
    -in "$ENC_ARCHIVE" \
    -out "$ARCHIVE" \
    -pass env:BACKUP_PASSPHRASE

  tar -xzf "$ARCHIVE" -C /
  echo "[restore] backup restored"
}

upload_backup() {
  echo "[backup] creating archive..."
  tar \
    --exclude='ql/data/log' \
    --exclude='ql/data/tmp' \
    -czf "$ARCHIVE" -C / ql/data

  openssl enc -aes-256-cbc -pbkdf2 -salt \
    -in "$ARCHIVE" \
    -out "$ENC_ARCHIVE" \
    -pass env:BACKUP_PASSPHRASE

  cd "$WORK_DIR"
  sha256sum latest.tar.gz.enc > latest.sha256

  aws s3 cp "$ENC_ARCHIVE" "s3://${R2_BUCKET}/${REMOTE_PREFIX}/latest.tar.gz.enc" --endpoint-url "${S3_ENDPOINT}"
  aws s3 cp "$SHA_FILE" "s3://${R2_BUCKET}/${REMOTE_PREFIX}/latest.sha256" --endpoint-url "${S3_ENDPOINT}"

  echo "[backup] uploaded"
}

case "${1:-}" in
  --restore) restore_backup ;;
  --upload) upload_backup ;;
  *) echo "usage: $0 --restore|--upload"; exit 1 ;;
esac
