FROM timescale/timescaledb:2.27.0-pg18
ARG POSTGRES_DB=iot_data_db
ENV POSTGRES_DB=${POSTGRES_DB}
COPY entry_script.sh /src/scripts/entry_script.sh
RUN chmod +x /src/scripts/entry_script.sh
RUN apk add gettext
COPY ./templates/sql_sript.sql /etc/postgres/templates/sql_sript.sql.template
HEALTHCHECK --interval=4s --timeout=12s --retries=30 \
  CMD POSTGRES_USER=$(grep '^POSTGRES_USER=' /run/secrets/timescaledb.txt | cut -d= -f2-) && pg_isready -U $POSTGRES_USER -d ${POSTGRES_DB}
ENTRYPOINT ["/src/scripts/entry_script.sh"]

