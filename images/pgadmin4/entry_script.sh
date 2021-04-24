#!/bin/sh

echo "################################## Run template_script"
envsubst < /pgadmin4/scripts/servers.json.template > /pgadmin4/servers.json
/entrypoint.sh