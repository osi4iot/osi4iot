FROM dpage/pgadmin4:2026-07-30-1
USER root
COPY /template/servers.json.template /pgadmin4/scripts/servers.json.template
COPY entry_script.sh /src/scripts/entry_script.sh
RUN chmod +x /src/scripts/entry_script.sh
RUN apk add gettext
RUN apk add --no-cache tzdata
RUN apk --no-cache add curl
HEALTHCHECK --interval=10s --timeout=5s --start-period=120s --retries=5 \
  CMD curl -f http://localhost || exit 1
USER pgadmin
ENTRYPOINT ["/src/scripts/entry_script.sh"]