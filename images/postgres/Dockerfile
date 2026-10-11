FROM postgres:14.6-alpine
ARG POSTGRES_DB=iot_platform_db
ENV POSTGRES_DB=${POSTGRES_DB}
COPY entry_script.sh /src/scripts/entry_script.sh
RUN chmod +x /src/scripts/entry_script.sh
RUN apk add gettext
COPY ./templates/sql_sript.sql /etc/postgres/templates/sql_sript.sql.template
HEALTHCHECK --interval=4s --timeout=12s --retries=30 \
  CMD POSTGRES_USER=$(grep '^POSTGRES_USER=' /run/secrets/postgres.txt | cut -d= -f2-) && pg_isready -U $POSTGRES_USER -d ${POSTGRES_DB}
ENTRYPOINT ["/src/scripts/entry_script.sh"]
