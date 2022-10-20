FROM quay.io/minio/minio:RELEASE.2022-10-15T19-57-03Z

ENV PATH=/opt/bin:$PATH
COPY ./entry_script.sh /usr/bin/entry_script.sh
RUN chmod +x /usr/bin/entry_script.sh

HEALTHCHECK --interval=30s --timeout=20s --retries=3 \
  CMD curl -f localhost:9000/minio/health/live || exit 1

ENTRYPOINT ["/usr/bin/entry_script.sh"]

VOLUME ["/data"] 

CMD ["minio"]
