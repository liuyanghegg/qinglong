/**
 * 青龙面板 Supabase 同步模块
 * 原则：
 *   - 启动先恢复 (restore)
 *   - 保存先写远端 (backup)
 *   - 本地只缓存
 *   - 只保关键配置
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// ========================================
// 配置
// ========================================
const QL_DIR = process.env.QL_DIR || '/ql';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// 从 Supabase URL 提取数据库连接信息
function getDbConfig() {
    if (!SUPABASE_URL) throw new Error('SUPABASE_URL 未设置');
    
    // Supabase 连接字符串格式
    const url = new URL(SUPABASE_URL);
    return {
        host: `db.${url.hostname}`,
        port: 5432,
        database: 'postgres',
        user: 'postgres',
        password: SUPABASE_SERVICE_KEY,
        ssl: { rejectUnauthorized: false }
    };
}

// ========================================
// 数据库客户端
// ========================================
class SupabaseClient {
    constructor() {
        this.client = null;
    }

    async connect() {
        if (this.client) return;
        
        this.client = new Client(getDbConfig());
        await this.client.connect();
        console.log('[Supabase] 连接成功');
    }

    async disconnect() {
        if (this.client) {
            await this.client.end();
            this.client = null;
        }
    }

    async query(sql, params = []) {
        await this.connect();
        return this.client.query(sql, params);
    }
}

const db = new SupabaseClient();

// ========================================
// 关键配置：本地路径 <-> 数据库表映射
// ========================================
const SYNC_CONFIG = {
    // 环境变量
    envVars: {
        table: 'env_vars',
        localPath: path.join(QL_DIR, 'data/config/env.sh'),
        restore: async () => {
            const { rows } = await db.query('SELECT * FROM env_vars WHERE status = 1');
            const content = rows.map(r => 
                `export ${r.name}="${r.value || ''}"  # ${r.remarks || ''}`
            ).join('\n');
            return `# 从 Supabase 恢复 - ${new Date().toISOString()}\n${content}`;
        },
        backup: async (content) => {
            // 解析 env.sh 内容
            const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
            for (const line of lines) {
                const match = line.match(/^export\s+(\w+)="([^"]*)"(.*)$/);
                if (match) {
                    const [, name, value, rest] = match;
                    const remarks = rest.replace(/^#/, '').trim();
                    await db.query(
                        `INSERT INTO env_vars (name, value, remarks) 
                         VALUES ($1, $2, $3) 
                         ON CONFLICT (name, value) DO UPDATE SET value = $2, remarks = $3`,
                        [name, value, remarks]
                    );
                }
            }
        }
    },

    // 脚本文件
    scripts: {
        table: 'scripts',
        localPath: path.join(QL_DIR, 'data/scripts'),
        restore: async () => {
            const { rows } = await db.query('SELECT * FROM scripts');
            const files = [];
            for (const script of rows) {
                const filePath = path.join(QL_DIR, 'data/scripts', script.parent_dir, script.filename);
                files.push({ path: filePath, content: script.content });
            }
            return files;
        },
        backup: async () => {
            const scriptsDir = path.join(QL_DIR, 'data/scripts');
            if (!fs.existsSync(scriptsDir)) return;
            
            const files = getAllFiles(scriptsDir);
            for (const file of files) {
                if (file.endsWith('.js') || file.endsWith('.py') || file.endsWith('.sh')) {
                    const content = fs.readFileSync(file, 'utf8');
                    const filename = path.basename(file);
                    const parentDir = path.dirname(file).replace(scriptsDir, '') || '/';
                    
                    await db.query(
                        `INSERT INTO scripts (filename, content, file_type, parent_dir) 
                         VALUES ($1, $2, $3, $4) 
                         ON CONFLICT (filename, parent_dir) DO UPDATE SET content = $2`,
                        [filename, content, path.extname(file).slice(1), parentDir]
                    );
                }
            }
        }
    },

    // 定时任务
    cronTasks: {
        table: 'cron_tasks',
        localPath: path.join(QL_DIR, 'data/db/crontab.db'),
        restore: async () => {
            const { rows } = await db.query('SELECT * FROM cron_tasks WHERE NOT is_disabled');
            return rows;
        },
        backup: async () => {
            // 从青龙面板数据库读取任务
            const dbPath = path.join(QL_DIR, 'data/db/crontab.db');
            if (!fs.existsSync(dbPath)) return;
            
            // 这里需要根据青龙面板的实际数据库格式解析
            // 简化处理：假设是 JSON 格式
            try {
                const content = fs.readFileSync(dbPath, 'utf8');
                const tasks = JSON.parse(content);
                for (const task of tasks) {
                    await db.query(
                        `INSERT INTO cron_tasks (name, command, schedule, is_disabled) 
                         VALUES ($1, $2, $3, $4) 
                         ON CONFLICT (command) DO UPDATE SET name = $1, schedule = $3, is_disabled = $4`,
                        [task.name, task.command, task.schedule, task.is_disabled || false]
                    );
                }
            } catch (e) {
                console.error('[Sync] 定时任务备份失败:', e.message);
            }
        }
    },

    // 依赖配置
    dependencies: {
        table: 'dependencies',
        localPath: path.join(QL_DIR, 'data/config/dep.sh'),
        restore: async () => {
            const { rows } = await db.query('SELECT * FROM dependencies');
            const lines = [];
            for (const dep of rows) {
                if (dep.dep_type === 'node') {
                    lines.push(`npm install -g ${dep.name}${dep.version ? '@' + dep.version : ''}`);
                } else if (dep.dep_type === 'python') {
                    lines.push(`pip install ${dep.name}${dep.version ? '==' + dep.version : ''}`);
                } else if (dep.dep_type === 'linux') {
                    lines.push(`apk add ${dep.name}`);
                }
            }
            return `# 从 Supabase 恢复 - ${new Date().toISOString()}\n${lines.join('\n')}`;
        },
        backup: async (content) => {
            const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
            for (const line of lines) {
                if (line.includes('npm install')) {
                    const match = line.match(/npm install -g\s+(\S+)/);
                    if (match) {
                        const pkg = match[1].split('@')[0];
                        const version = match[1].split('@')[1] || null;
                        await db.query(
                            `INSERT INTO dependencies (name, dep_type, version) 
                             VALUES ($1, 'node', $2) 
                             ON CONFLICT (name, dep_type) DO UPDATE SET version = $2`,
                            [pkg, version]
                        );
                    }
                } else if (line.includes('pip install')) {
                    const match = line.match(/pip install\s+(\S+)/);
                    if (match) {
                        const pkg = match[1].split('==')[0];
                        const version = match[1].split('==')[1] || null;
                        await db.query(
                            `INSERT INTO dependencies (name, dep_type, version) 
                             VALUES ($1, 'python', $2) 
                             ON CONFLICT (name, dep_type) DO UPDATE SET version = $2`,
                            [pkg, version]
                        );
                    }
                }
            }
        }
    },

    // 订阅
    subscriptions: {
        table: 'subscriptions',
        localPath: path.join(QL_DIR, 'data/config/sub.sh'),
        restore: async () => {
            const { rows } = await db.query('SELECT * FROM subscriptions WHERE status = 1');
            return rows;
        },
        backup: async () => {
            // 从本地配置读取订阅信息
            const subPath = path.join(QL_DIR, 'data/config/sub.sh');
            if (!fs.existsSync(subPath)) return;
            
            const content = fs.readFileSync(subPath, 'utf8');
            const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
            
            for (const line of lines) {
                const parts = line.split('|').map(p => p.trim());
                if (parts.length >= 2) {
                    await db.query(
                        `INSERT INTO subscriptions (name, url, type) 
                         VALUES ($1, $2, $3)`,
                        [parts[0], parts[1], parts[2] || 'public']
                    );
                }
            }
        }
    }
};

// ========================================
// 工具函数
// ========================================
function getAllFiles(dir) {
    const files = [];
    if (!fs.existsSync(dir)) return files;
    
    const items = fs.readdirSync(dir);
    for (const item of items) {
        const fullPath = path.join(dir, item);
        if (fs.statSync(fullPath).isDirectory()) {
            files.push(...getAllFiles(fullPath));
        } else {
            files.push(fullPath);
        }
    }
    return files;
}

function ensureDir(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

// ========================================
// 核心操作
// ========================================
async function restore() {
    console.log('[Restore] 开始从 Supabase 恢复数据...');
    
    try {
        await db.connect();
        
        for (const [key, config] of Object.entries(SYNC_CONFIG)) {
            try {
                console.log(`[Restore] 恢复 ${key}...`);
                const data = await config.restore();
                
                if (key === 'scripts' && Array.isArray(data)) {
                    // 脚本文件需要逐个写入
                    for (const file of data) {
                        ensureDir(file.path);
                        fs.writeFileSync(file.path, file.content, 'utf8');
                    }
                } else if (typeof data === 'string') {
                    // 文本配置文件
                    ensureDir(config.localPath);
                    fs.writeFileSync(config.localPath, data, 'utf8');
                } else if (Array.isArray(data)) {
                    // JSON 数据（如定时任务、订阅）
                    ensureDir(config.localPath);
                    fs.writeFileSync(config.localPath, JSON.stringify(data, null, 2), 'utf8');
                }
                
                console.log(`[Restore] ${key} 恢复完成`);
            } catch (e) {
                console.error(`[Restore] ${key} 恢复失败:`, e.message);
            }
        }
        
        // 更新同步状态
        await db.query(
            `INSERT INTO sync_state (key, value) VALUES ('last_boot', $1) 
             ON CONFLICT (key) DO UPDATE SET value = $1`,
            [new Date().toISOString()]
        );
        
        console.log('[Restore] 数据恢复完成');
    } catch (e) {
        console.error('[Restore] 恢复过程出错:', e);
    } finally {
        await db.disconnect();
    }
}

async function backup() {
    console.log('[Backup] 开始备份数据到 Supabase...');
    
    try {
        await db.connect();
        
        for (const [key, config] of Object.entries(SYNC_CONFIG)) {
            try {
                console.log(`[Backup] 备份 ${key}...`);
                
                if (config.backup.length === 1 && typeof config.backup === 'function') {
                    // 需要读取本地文件的备份
                    if (fs.existsSync(config.localPath)) {
                        const content = fs.readFileSync(config.localPath, 'utf8');
                        await config.backup(content);
                    }
                } else {
                    await config.backup();
                }
                
                console.log(`[Backup] ${key} 备份完成`);
            } catch (e) {
                console.error(`[Backup] ${key} 备份失败:`, e.message);
            }
        }
        
        // 更新同步状态
        await db.query(
            `INSERT INTO sync_state (key, value) VALUES ('last_sync', $1) 
             ON CONFLICT (key) DO UPDATE SET value = $1`,
            [new Date().toISOString()]
        );
        
        console.log('[Backup] 数据备份完成');
    } catch (e) {
        console.error('[Backup] 备份过程出错:', e);
    } finally {
        await db.disconnect();
    }
}

// ========================================
// 入口
// ========================================
async function main() {
    const mode = process.argv[2] || 'backup';
    
    switch (mode) {
        case 'restore':
            await restore();
            break;
        case 'backup':
            await backup();
            break;
        case 'sync':
            await restore();
            await backup();
            break;
        default:
            console.log('Usage: node sync.js [restore|backup|sync]');
            process.exit(1);
    }
}

main().catch(console.error);
