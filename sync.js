/**
 * 青龙面板 Supabase 同步模块
 * 启动先恢复，保存先写远端，本地只缓存
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const QL_DIR = process.env.QL_DIR || '/ql';

// Supabase 配置
const DB_CONFIG = {
    host: process.env.SUPABASE_HOST || 'aws-1-ap-south-1.pooler.supabase.com',
    port: parseInt(process.env.SUPABASE_PORT || '6543'),
    database: process.env.SUPABASE_DB || 'postgres',
    user: process.env.SUPABASE_USER || 'postgres',
    password: process.env.SUPABASE_PASSWORD || '',
    ssl: { rejectUnauthorized: false }
};

// 日志函数
function log(msg) {
    const time = new Date().toISOString();
    const line = `[${time}] ${msg}`;
    console.log(line);
    try {
        fs.appendFileSync(path.join(QL_DIR, 'data/logs/sync.log'), line + '\n');
    } catch (e) {}
}

// 数据库连接
async function getDb() {
    const client = new Client(DB_CONFIG);
    await client.connect();
    return client;
}

// ========================================
// 恢复：从 Supabase 拉取到本地
// ========================================
async function restore() {
    log('========== 开始恢复 ==========');
    let db;
    
    try {
        db = await getDb();
        
        // 1. 恢复环境变量
        log('恢复环境变量...');
        const { rows: envs } = await db.query('SELECT * FROM env_vars WHERE status = 1');
        let envContent = '# 从 Supabase 恢复\n';
        for (const env of envs) {
            envContent += `export ${env.name}="${(env.value || '').replace(/"/g, '\\"')}"\n`;
        }
        const envPath = path.join(QL_DIR, 'data/config/env.sh');
        ensureDir(envPath);
        fs.writeFileSync(envPath, envContent);
        log(`  ✓ 恢复 ${envs.length} 个环境变量`);
        
        // 2. 恢复脚本文件
        log('恢复脚本文件...');
        const { rows: scripts } = await db.query('SELECT * FROM scripts');
        for (const script of scripts) {
            const scriptDir = path.join(QL_DIR, 'data/scripts', script.parent_dir || '');
            const scriptPath = path.join(scriptDir, script.filename);
            ensureDir(scriptPath);
            fs.writeFileSync(scriptPath, script.content || '');
        }
        log(`  ✓ 恢复 ${scripts.length} 个脚本文件`);
        
        // 3. 恢复依赖配置
        log('恢复依赖配置...');
        const { rows: deps } = await db.query('SELECT * FROM dependencies');
        let depContent = '# 从 Supabase 恢复\n';
        for (const dep of deps) {
            if (dep.dep_type === 'node') {
                depContent += `npm install -g ${dep.name}${dep.version ? '@' + dep.version : ''}\n`;
            } else if (dep.dep_type === 'python') {
                depContent += `pip3 install ${dep.name}${dep.version ? '==' + dep.version : ''}\n`;
            } else if (dep.dep_type === 'linux') {
                depContent += `apk add ${dep.name}\n`;
            }
        }
        const depPath = path.join(QL_DIR, 'data/config/dep.sh');
        fs.writeFileSync(depPath, depContent);
        log(`  ✓ 恢复 ${deps.length} 个依赖`);
        
        // 4. 恢复订阅
        log('恢复订阅...');
        const { rows: subs } = await db.query('SELECT * FROM subscriptions WHERE status = 1');
        let subContent = '# 从 Supabase 恢复\n';
        for (const sub of subs) {
            subContent += `${sub.name}|${sub.url}|${sub.type || 'public'}|${sub.branch || 'main'}|${sub.whitelist || ''}|${sub.blacklist || ''}|${sub.dependences || ''}\n`;
        }
        const subPath = path.join(QL_DIR, 'data/config/sub.sh');
        fs.writeFileSync(subPath, subContent);
        log(`  ✓ 恢复 ${subs.length} 个订阅`);
        
        // 5. 恢复定时任务
        log('恢复定时任务...');
        const { rows: tasks } = await db.query('SELECT * FROM cron_tasks WHERE NOT is_disabled');
        // 定时任务存储在 SQLite 中，需要通过青龙面板的命令行工具导入
        // 这里先写入一个临时文件，启动后通过脚本导入
        const taskPath = path.join(QL_DIR, 'data/config/tasks.json');
        fs.writeFileSync(taskPath, JSON.stringify(tasks, null, 2));
        log(`  ✓ 恢复 ${tasks.length} 个定时任务`);
        
        // 更新同步状态
        await db.query(
            `INSERT INTO sync_state (key, value, updated_at) VALUES ('last_restore', $1, NOW())
             ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
            [new Date().toISOString()]
        );
        
        log('========== 恢复完成 ==========');
        return true;
        
    } catch (e) {
        log('恢复失败: ' + e.message);
        return false;
    } finally {
        if (db) await db.end();
    }
}

// ========================================
// 备份：从本地推送到 Supabase
// ========================================
async function backup() {
    log('========== 开始备份 ==========');
    let db;
    
    try {
        db = await getDb();
        
        // 1. 备份环境变量
        log('备份环境变量...');
        const envPath = path.join(QL_DIR, 'data/config/env.sh');
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf8');
            const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
            
            for (const line of lines) {
                const match = line.match(/^export\s+(\w+)="(.*)"$/);
                if (match) {
                    await db.query(
                        `INSERT INTO env_vars (name, value) VALUES ($1, $2)
                         ON CONFLICT (name, value) DO UPDATE SET value = $2, updated_at = NOW()`,
                        [match[1], match[2]]
                    );
                }
            }
        }
        log('  ✓ 环境变量已备份');
        
        // 2. 备份脚本文件
        log('备份脚本文件...');
        const scriptsDir = path.join(QL_DIR, 'data/scripts');
        if (fs.existsSync(scriptsDir)) {
            const files = getAllFiles(scriptsDir);
            for (const file of files) {
                if (file.match(/\.(js|py|sh|ts)$/)) {
                    const content = fs.readFileSync(file, 'utf8');
                    const filename = path.basename(file);
                    const relPath = path.relative(scriptsDir, path.dirname(file));
                    const parentDir = relPath || '/';
                    
                    await db.query(
                        `INSERT INTO scripts (filename, content, file_type, parent_dir)
                         VALUES ($1, $2, $3, $4)
                         ON CONFLICT (filename, parent_dir) DO UPDATE SET content = $2, updated_at = NOW()`,
                        [filename, content, path.extname(file).slice(1), parentDir]
                    );
                }
            }
        }
        log('  ✓ 脚本文件已备份');
        
        // 3. 备份订阅
        log('备份订阅...');
        const subPath = path.join(QL_DIR, 'data/config/sub.sh');
        if (fs.existsSync(subPath)) {
            const content = fs.readFileSync(subPath, 'utf8');
            const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
            
            for (const line of lines) {
                const parts = line.split('|');
                if (parts.length >= 2) {
                    await db.query(
                        `INSERT INTO subscriptions (name, url, type, branch, whitelist, blacklist, dependences)
                         VALUES ($1, $2, $3, $4, $5, $6, $7)
                         ON CONFLICT (name) DO UPDATE SET url = $2, updated_at = NOW()`,
                        [parts[0], parts[1], parts[2] || 'public', parts[3] || 'main', parts[4] || '', parts[5] || '', parts[6] || '']
                    );
                }
            }
        }
        log('  ✓ 订阅已备份');
        
        // 4. 备份依赖配置
        log('备份依赖配置...');
        const depPath = path.join(QL_DIR, 'data/config/dep.sh');
        if (fs.existsSync(depPath)) {
            const content = fs.readFileSync(depPath, 'utf8');
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
                } else if (line.includes('pip')) {
                    const match = line.match(/pip3?\s+install\s+(\S+)/);
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
        log('  ✓ 依赖配置已备份');
        
        // 更新同步状态
        await db.query(
            `INSERT INTO sync_state (key, value, updated_at) VALUES ('last_backup', $1, NOW())
             ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
            [new Date().toISOString()]
        );
        
        log('========== 备份完成 ==========');
        return true;
        
    } catch (e) {
        log('备份失败: ' + e.message);
        return false;
    } finally {
        if (db) await db.end();
    }
}

// ========================================
// 工具函数
// ========================================
function ensureDir(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

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

// ========================================
// 入口
// ========================================
async function main() {
    const mode = process.argv[2] || 'backup';
    
    // 检查环境变量
    if (!process.env.SUPABASE_PASSWORD) {
        console.error('错误: SUPABASE_PASSWORD 未设置');
        process.exit(1);
    }
    
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
            console.log('用法: node sync.js [restore|backup|sync]');
            process.exit(1);
    }
}

main().catch(e => {
    console.error('执行失败:', e);
    process.exit(1);
});
