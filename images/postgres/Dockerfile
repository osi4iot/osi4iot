FROM timescale/timescaledb:2.4.1-pg13
ENV POSTGRES_PASSWORD=$POSTGRES_PASSWORD
ENV POSTGRES_USER=$POSTGRES_USER
ENV POSTGRES_DB=$POSTGRES_DB
COPY entry_script.sh /src/scripts/entry_script.sh
RUN chmod +x /src/scripts/entry_script.sh
RUN apk add gettext
COPY ./templates/sql_sript.sql /etc/postgres/templates/sql_sript.sql.template
HEALTHCHECK --interval=4s --timeout=12s --retries=30 \
  CMD pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}
ENTRYPOINT ["/src/scripts/entry_script.sh"]
