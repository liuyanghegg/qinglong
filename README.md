# 青龙面板 Render + Supabase 终极免费方案

## 架构概览

```
┌─────────────────┐         ┌─────────────────┐
│   Render 免费    │ ──────► │  Supabase 免费   │
│  (无状态容器)    │         │  (唯一数据源)    │
│                 │         │                 │
│ 启动 → 拉配置   │         │ PostgreSQL      │
│ 运行 → 写远程   │         │ 全量关键配置     │
│ 重启 → 本地清零  │         │                 │
└─────────────────┘         └─────────────────┘
```

## 核心原则

| 原则 | 实现 |
|------|------|
| Render不当数据源 | 文件系统临时，不依赖本地持久化 |
| Supabase当真源 | PostgreSQL 存储全部关键配置 |
| 启动先恢复 | `onBoot` 从 Supabase 拉取并写入本地 |
| 保存先写远端 | `beforeSave` 先写 Supabase 再写本地 |
| 本地只缓存 | 本地文件仅作运行时缓存，随时可丢 |
| 只保关键配置 | 脚本代码、环境变量、定时任务、依赖列表 |

## 部署状态

✅ **已完成部署**

- **Supabase 数据库**: 已创建 7 张表
- **Render 服务**: 已创建并配置
- **访问地址**: https://qinglong-gecf.onrender.com

## 文件结构

```
qinglong-supabase/
├── init-db.sql           # Supabase 建表 SQL
├── Dockerfile            # Render 部署配置
├── render.yaml           # Render 服务配置
├── deploy.js             # 自动部署脚本
├── check-status.js       # 状态检查脚本
├── scripts/
│   ├── start.sh          # 启动恢复脚本
│   └── sync.js           # 数据同步模块
└── config/
    └── config.sh         # 青龙面板配置
```

## 数据库表结构

| 表名 | 用途 |
|------|------|
| `env_vars` | 环境变量（核心） |
| `cron_tasks` | 定时任务 |
| `scripts` | 脚本文件内容 |
| `dependencies` | 依赖配置 |
| `config_files` | 配置文件 |
| `subscriptions` | 订阅管理 |
| `sync_state` | 同步状态记录 |

## 使用说明

### 1. 访问青龙面板

首次访问 https://qinglong-gecf.onrender.com，等待冷启动（约 30-60 秒）。

### 2. 获取初始密码

首次启动后，查看 Render 日志获取初始管理员密码：

1. 登录 Render Dashboard: https://dashboard.render.com
2. 进入 `qinglong` 服务
3. 查看 `Logs` 标签
4. 搜索 `password` 关键字

### 3. 修改密码

登录后立即修改默认密码：
- 进入 `系统设置` > `用户管理`
- 修改管理员密码

### 4. 添加环境变量

在青龙面板中添加的环境变量会自动同步到 Supabase，重启后不丢失。

### 5. 添加定时任务

创建的定时任务会自动同步到 Supabase，重启后自动恢复。

## 重要限制

### Render 免费版限制

- **休眠**: 15 分钟无活动后休眠
- **冷启动**: 首次访问需等待 30-60 秒
- **带宽**: 100 GB/月
- **构建时间**: 500 分钟/月

### Supabase 免费版限制

- **存储**: 500 MB
- **项目**: 2 个免费项目
- **API 请求**: 500,000/月

## 数据同步机制

### 启动时恢复 (restore)

```
1. Render 容器启动
2. 执行 start.sh
3. 连接 Supabase
4. 拉取所有关键配置
5. 写入本地文件（仅作缓存）
6. 启动青龙面板
```

### 运行时备份 (backup)

```
1. 定时任务每 5 分钟执行
2. 读取本地配置变更
3. 写入 Supabase
4. 更新同步状态
```

## 常见问题

### Q: 数据丢失了怎么办？

A: 数据存储在 Supabase，不会丢失。重启后会自动从 Supabase 恢复。

### Q: 如何手动触发同步？

A: 在青龙面板中执行：
```bash
node /ql/scripts/_system/sync.js backup
```

### Q: 如何查看同步日志？

A: 查看 `/ql/data/logs/sync.log`

### Q: 服务休眠了怎么办？

A: 直接访问 URL，等待 30-60 秒冷启动。

## 维护命令

### 检查服务状态

```bash
node check-status.js
```

### 手动触发部署

```bash
node deploy.js
```

### 查看 Render 日志

登录 Render Dashboard 查看实时日志。

## 安全提醒

1. **立即修改默认密码**
2. **不要泄露 API Key**
3. **定期检查 Supabase 访问日志**
4. **启用 Render 的两步验证**

## 许可证

MIT License
