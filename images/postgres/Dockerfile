#FROM timescale/timescaledb-postgis:2.0.0-pg12
FROM timescale/timescaledb:latest-pg12
ENV POSTGRES_PASSWORD=$POSTGRES_PASSWORD
ENV POSTGRES_USER=$POSTGRES_USER
ENV POSTGRES_DB=$POSTGRES_DB
COPY entry_script.sh /src/scripts/entry_script.sh
RUN chmod +x /src/scripts/entry_script.sh
RUN apk add gettext
COPY ./templates/sql_sript.sql /etc/postgres/templates/sql_sript.sql.template
ENTRYPOINT ["/src/scripts/entry_script.sh"]
