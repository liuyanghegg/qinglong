#!/bin/bash

# ========================================
# 青龙面板启动脚本
# 启动先恢复，定时备份
# ========================================

QL_DIR="${QL_DIR:-/ql}"
LOG="$QL_DIR/data/logs/sync.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG"
}

# 确保目录存在
mkdir -p "$QL_DIR/data/logs"
mkdir -p "$QL_DIR/data/config"
mkdir -p "$QL_DIR/data/scripts"
mkdir -p "$QL_DIR/data/db"
mkdir -p "$QL_DIR/data/repo"
mkdir -p "$QL_DIR/data/raw"

log "========================================"
log "青龙面板启动 - Supabase 同步模式"
log "========================================"

# 检查 Supabase 配置
if [ -n "$SUPABASE_PASSWORD" ]; then
    log "检测到 Supabase 配置，开始恢复数据..."
    cd "$QL_DIR"
    node scripts/_system/sync.js restore
    if [ $? -eq 0 ]; then
        log "数据恢复成功"
    else
        log "数据恢复失败，使用默认配置启动"
    fi
    
    # 设置定时备份 (每5分钟)
    log "设置定时备份..."
    echo "*/5 * * * * cd $QL_DIR && node scripts/_system/sync.js backup >> $LOG 2>&1" | crontab -
else
    log "未检测到 Supabase 配置，跳过数据恢复"
fi

log "启动青龙面板..."

# 调用原始入口点
if [ -f "$QL_DIR/docker/docker-entrypoint.sh" ]; then
    exec "$QL_DIR/docker/docker-entrypoint.sh"
elif [ -f "/docker-entrypoint.sh" ]; then
    exec "/docker-entrypoint.sh"
else
    # 直接启动
    cd "$QL_DIR"
    exec node build/app.js
fi
