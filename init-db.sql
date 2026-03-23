-- ========================================
-- 青龙面板 Supabase 数据库初始化
-- 原则：只存关键配置，不存一切
-- ========================================

-- 启用必要的扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================
-- 1. 环境变量表（核心）
-- ========================================
CREATE TABLE IF NOT EXISTS env_vars (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    value TEXT,
    remarks TEXT,
    status SMALLINT DEFAULT 1, -- 1=启用 0=禁用
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(name, value)
);

CREATE INDEX idx_env_vars_name ON env_vars(name);
CREATE INDEX idx_env_vars_status ON env_vars(status);

-- ========================================
-- 2. 定时任务表
-- ========================================
CREATE TABLE IF NOT EXISTS cron_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    command TEXT NOT NULL,
    schedule VARCHAR(100) NOT NULL,
    is_disabled BOOLEAN DEFAULT FALSE,
    is_running BOOLEAN DEFAULT FALSE,
    last_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cron_tasks_command ON cron_tasks(command);

-- ========================================
-- 3. 脚本文件表（只存代码，不存依赖）
-- ========================================
CREATE TABLE IF NOT EXISTS scripts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename VARCHAR(500) NOT NULL,
    content TEXT,
    file_type VARCHAR(50) DEFAULT 'js',
    parent_dir VARCHAR(500) DEFAULT '/',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(filename, parent_dir)
);

CREATE INDEX idx_scripts_filename ON scripts(filename);

-- ========================================
-- 4. 依赖配置表（只存依赖名，不存包）
-- ========================================
CREATE TABLE IF NOT EXISTS dependencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    dep_type VARCHAR(50) NOT NULL, -- node, python, linux
    version VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(name, dep_type)
);

-- ========================================
-- 5. 配置文件表（关键配置）
-- ========================================
CREATE TABLE IF NOT EXISTS config_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename VARCHAR(255) NOT NULL UNIQUE,
    content TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================
-- 6. 订阅管理表
-- ========================================
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- public, private
    url TEXT,
    whitelist TEXT,
    blacklist TEXT,
    dependences TEXT,
    branch VARCHAR(100) DEFAULT 'main',
    status SMALLINT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================
-- 7. 系统状态表（记录最后同步时间）
-- ========================================
CREATE TABLE IF NOT EXISTS sync_state (
    key VARCHAR(255) PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 初始化同步状态
INSERT INTO sync_state (key, value) VALUES 
    ('last_boot', NOW()::TEXT),
    ('last_sync', NOW()::TEXT)
ON CONFLICT (key) DO NOTHING;

-- ========================================
-- 触发器：自动更新 updated_at
-- ========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_env_vars_updated_at BEFORE UPDATE ON env_vars
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cron_tasks_updated_at BEFORE UPDATE ON cron_tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scripts_updated_at BEFORE UPDATE ON scripts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_config_files_updated_at BEFORE UPDATE ON config_files
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- RLS 策略（可选，增强安全性）
-- ========================================
ALTER TABLE env_vars ENABLE ROW LEVEL SECURITY;
ALTER TABLE cron_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- 允许所有操作（因为使用 service_role key）
CREATE POLICY "Allow all" ON env_vars FOR ALL USING (true);
CREATE POLICY "Allow all" ON cron_tasks FOR ALL USING (true);
CREATE POLICY "Allow all" ON scripts FOR ALL USING (true);
CREATE POLICY "Allow all" ON dependencies FOR ALL USING (true);
CREATE POLICY "Allow all" ON config_files FOR ALL USING (true);
CREATE POLICY "Allow all" ON subscriptions FOR ALL USING (true);
