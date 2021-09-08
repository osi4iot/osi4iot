FROM dpage/pgadmin4:2021-09-06-2
USER root
COPY /template/servers.json.template /pgadmin4/scripts/servers.json.template
COPY entry_script.sh /pgadmin4/scripts/entry_script.sh
RUN chmod +x /pgadmin4/scripts/entry_script.sh
RUN apk add gettext
RUN apk --no-cache add curl
HEALTHCHECK --interval=10s --timeout=300s --retries=30 \
  CMD curl -f http://localhost || exit 1
USER pgadmin
ENTRYPOINT ["/pgadmin4/scripts/entry_script.sh"]