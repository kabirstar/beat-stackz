# Nightly pg_dump -> S3 (R2). postgres:17 gives a matching pg_dump; awscli does the upload.
FROM postgres:17
RUN apt-get update && apt-get install -y --no-install-recommends awscli ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY infra/backup/backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh
USER postgres
ENTRYPOINT ["/usr/local/bin/backup.sh"]
CMD ["loop"]
