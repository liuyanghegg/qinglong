#!/bin/bash

# ========================================
# 青龙面板启动脚本
# 原则：启动先恢复，本地只缓存
# ========================================

set -e

QL_DIR="${QL_DIR:-/ql}"
LOG_FILE="$QL_DIR/data/logs/start.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# ========================================
# 1. 检查必要环境变量
# ========================================
check_env() {
    if [ -z "$SUPABASE_URL" ]; then
        log "ERROR: SUPABASE_URL 未设置"
        exit 1
    fi
    if [ -z "$SUPABASE_SERVICE_KEY" ]; then
        log "ERROR: SUPABASE_SERVICE_KEY 未设置"
        exit 1
    fi
    log "环境变量检查通过"
}

# ========================================
# 2. 从 Supabase 恢复数据
# ========================================
restore_from_supabase() {
    log "开始从 Supabase 恢复数据..."
    
    # 运行同步脚本（恢复模式）
    cd "$QL_DIR"
    node scripts/_system/sync.js restore
    
    if [ $? -eq 0 ]; then
        log "数据恢复完成"
    else
        log "WARNING: 数据恢复失败，使用空配置启动"
    fi
}

# ========================================
# 3. 初始化青龙面板目录结构
# ========================================
init_directories() {
    log "初始化目录结构..."
    
    mkdir -p "$QL_DIR/data/config"
    mkdir -p "$QL_DIR/data/scripts"
    mkdir -p "$QL_DIR/data/logs"
    mkdir -p "$QL_DIR/data/db"
    mkdir -p "$QL_DIR/data/repo"
    mkdir -p "$QL_DIR/data/raw"
    
    log "目录初始化完成"
}

# ========================================
# 4. 创建定时同步任务
# ========================================
setup_sync_cron() {
    log "设置定时同步..."
    
    # 每5分钟同步一次到 Supabase
    echo "*/5 * * * * cd $QL_DIR && node scripts/_system/sync.js backup >> $QL_DIR/data/logs/sync.log 2>&1" > /tmp/crontab.tmp
    
    # 添加青龙面板原有的定时任务
    crontab /tmp/crontab.tmp 2>/dev/null || true
    
    log "定时同步设置完成"
}

# ========================================
# 5. 启动青龙面板
# ========================================
start_qinglong() {
    log "启动青龙面板..."
    
    # 调用原始启动逻辑
    if [ -f "$QL_DIR/docker/docker-entrypoint.sh" ]; then
        exec "$QL_DIR/docker/docker-entrypoint.sh"
    else
        # 直接启动 Node.js 服务
        cd "$QL_DIR"
        exec node build/app.js
    fi
}

# ========================================
# 主流程
# ========================================
main() {
    log "========================================"
    log "青龙面板启动 - Render + Supabase 模式"
    log "========================================"
    
    check_env
    init_directories
    restore_from_supabase
    setup_sync_cron
    start_qinglong
}

main "$@"
