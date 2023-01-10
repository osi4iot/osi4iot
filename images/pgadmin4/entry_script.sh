#!/bin/sh

echo "################################## Run template_script"

if [ -f "/run/secrets/pgadmin4.txt" ]
then
    export $(cat /run/secrets/pgadmin4.txt | grep PGADMIN_DEFAULT_EMAIL)
    export $(cat /run/secrets/pgadmin4.txt | grep PGADMIN_DEFAULT_PASSWORD)
    export $(cat /run/secrets/pgadmin4.txt | grep POSTGRES_USER)
    export $(cat /run/secrets/pgadmin4.txt | grep TIMESCALE_USER)
fi

envsubst < /pgadmin4/scripts/servers.json.template > /pgadmin4/servers.json
/entrypoint.sh