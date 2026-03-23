FROM whyour/qinglong:latest

USER root

# 安装 PostgreSQL 客户端
RUN apk add --no-cache postgresql-client

# 安装 Node.js PostgreSQL 驱动
RUN cd /ql && npm install pg@8 --save

# 创建同步脚本目录
RUN mkdir -p /ql/scripts/_system

# 复制同步脚本
COPY sync.js /ql/scripts/_system/
COPY entrypoint.sh /ql/entrypoint.sh

# 设置执行权限
RUN chmod +x /ql/entrypoint.sh

USER node

ENTRYPOINT ["/ql/entrypoint.sh"]
