const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const QL_DIR = process.env.QL_DIR || '/ql';
const LOG_FILE = path.join(QL_DIR, 'data/logs/sync.log');
const CHECK_INTERVAL = 3000;
const DEBOUNCE_MS = 2000;

const watchTargets = [
  path.join(QL_DIR, 'data/config/env.sh'),
  path.join(QL_DIR, 'data/config/dep.sh'),
  path.join(QL_DIR, 'data/config/sub.sh'),
  path.join(QL_DIR, 'data/scripts'),
];

let lastSignature = '';
let backupTimer = null;
let backupRunning = false;

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, `${line}\n`);
  } catch {}
}

function safeStat(targetPath) {
  try {
    return fs.statSync(targetPath);
  } catch {
    return null;
  }
}

function walk(dir) {
  const results = [];
  const stat = safeStat(dir);
  if (!stat) return results;
  if (!stat.isDirectory()) return [`${dir}:${stat.mtimeMs}:${stat.size}`];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(fullPath));
    } else {
      const entryStat = safeStat(fullPath);
      if (entryStat) {
        results.push(`${fullPath}:${entryStat.mtimeMs}:${entryStat.size}`);
      }
    }
  }
  return results;
}

function buildSignature() {
  const parts = [];
  for (const target of watchTargets) {
    const stat = safeStat(target);
    if (!stat) {
      parts.push(`${target}:missing`);
      continue;
    }

    if (stat.isDirectory()) {
      parts.push(...walk(target));
    } else {
      parts.push(`${target}:${stat.mtimeMs}:${stat.size}`);
    }
  }
  return parts.sort().join('|');
}

function runBackup(reason) {
  if (backupRunning) return;
  backupRunning = true;
  log(`检测到数据变更，开始同步到 Supabase: ${reason}`);

  const child = spawn('node', ['scripts/_system/sync.js', 'backup'], {
    cwd: QL_DIR,
    env: process.env,
    stdio: 'inherit',
  });

  child.on('exit', (code) => {
    backupRunning = false;
    log(code === 0 ? '同步完成' : `同步失败，退出码 ${code}`);
    lastSignature = buildSignature();
  });
}

function scheduleBackup(reason) {
  if (backupTimer) clearTimeout(backupTimer);
  backupTimer = setTimeout(() => runBackup(reason), DEBOUNCE_MS);
}

function poll() {
  const nextSignature = buildSignature();
  if (!lastSignature) {
    lastSignature = nextSignature;
    return;
  }

  if (nextSignature !== lastSignature) {
    lastSignature = nextSignature;
    scheduleBackup('文件已保存');
  }
}

function main() {
  if (!process.env.SUPABASE_PASSWORD) {
    log('未配置 SUPABASE_PASSWORD，跳过监听同步');
    process.exit(0);
  }

  log('启动保存后同步监听器');
  lastSignature = buildSignature();
  setInterval(poll, CHECK_INTERVAL);
}

main();
