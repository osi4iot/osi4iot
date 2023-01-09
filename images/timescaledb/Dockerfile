FROM timescale/timescaledb:2.4.2-pg13
ENV TIMESCALE_DB=$POSTGRES_DB
COPY entry_script.sh /src/scripts/entry_script.sh
RUN chmod +x /src/scripts/entry_script.sh
RUN apk add gettext
COPY ./templates/sql_sript.sql /etc/postgres/templates/sql_sript.sql.template
HEALTHCHECK --interval=4s --timeout=12s --retries=30 \
  CMD TIMESCALE_USER=$(cat /run/secrets/timescaledb_user.txt) && pg_isready -U $TIMESCALE_USER -d ${TIMESCALE_DB}
ENTRYPOINT ["/src/scripts/entry_script.sh"]
