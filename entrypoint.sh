#!/bin/bash
set -e

QL_DIR="/ql"
LOG="$QL_DIR/data/logs/sync.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG" 2>/dev/null || echo "$1"
}

# 确保目录存在
mkdir -p "$QL_DIR/data/logs" "$QL_DIR/data/config" "$QL_DIR/data/scripts" "$QL_DIR/data/db"

log "========================================"
log "青龙面板启动 - Supabase 同步模式"
log "========================================"

# 检查 Supabase 配置并恢复数据
if [ -n "$SUPABASE_PASSWORD" ] && [ -f "$QL_DIR/scripts/_system/sync.js" ]; then
    log "检测到 Supabase 配置，开始恢复数据..."
    cd "$QL_DIR"
    timeout 60 node scripts/_system/sync.js restore 2>&1 | tee -a "$LOG" || log "恢复失败，继续启动"
fi

# 设置定时备份 (每5分钟)
if [ -n "$SUPABASE_PASSWORD" ]; then
    (crontab -l 2>/dev/null || true; echo "*/5 * * * * cd $QL_DIR && node scripts/_system/sync.js backup >> $LOG 2>&1") | crontab -
    log "定时备份已设置"

    # 首次启动后主动执行一次备份，尽快验证同步链路
    (
        sleep 90
        cd "$QL_DIR"
        node scripts/_system/sync.js backup >> "$LOG" 2>&1 || true
    ) &
    log "已安排首次启动备份"
fi

log "启动青龙面板..."

# 启动青龙面板 (查找原始入口点)
if [ -f "$QL_DIR/docker/docker-entrypoint.sh" ]; then
    exec "$QL_DIR/docker/docker-entrypoint.sh" "$@"
elif [ -f "/docker-entrypoint.sh" ]; then
    exec "/docker-entrypoint.sh" "$@"
else
    # 直接启动
    cd "$QL_DIR"
    exec node build/app.js "$@"
fi
