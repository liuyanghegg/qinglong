FROM whyour/qinglong:latest

USER root

WORKDIR /ql

# 安装 PostgreSQL 客户端
RUN set -ex && \
    if [ -f /etc/alpine-release ]; then \
        apk update && apk add --no-cache postgresql-client; \
    elif [ -f /etc/debian_version ]; then \
        apt-get update && apt-get install -y postgresql-client && rm -rf /var/lib/apt/lists/*; \
    fi

# 安装 pg 驱动
RUN cd /ql && npm install pg@8 --save 2>/dev/null || true

# 创建目录
RUN mkdir -p /ql/scripts/_system /ql/data/logs

# 复制同步脚本
COPY sync.js /ql/scripts/_system/sync.js
RUN chmod +x /ql/scripts/_system/sync.js

# 复制入口点脚本
COPY entrypoint.sh /docker-entrypoint-custom.sh
RUN chmod +x /docker-entrypoint-custom.sh

EXPOSE 5700

ENTRYPOINT ["/docker-entrypoint-custom.sh"]
