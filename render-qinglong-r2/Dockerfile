FROM whyour/qinglong:latest

USER root

RUN apk add --no-cache bash curl tar openssl coreutils python3 py3-pip && \
    pip3 install --no-cache-dir awscli

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
COPY backup.sh /usr/local/bin/backup.sh
COPY sync.sh /usr/local/bin/sync.sh

RUN chmod +x /usr/local/bin/entrypoint.sh \
    /usr/local/bin/backup.sh \
    /usr/local/bin/sync.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
