#!/bin/sh

echo "################################## Run template_script"

if [ -f "/run/secrets/nodered.txt" ]
then
    export $(cat /run/secrets/nodered.txt | grep POSTGRES_USER)
    export $(cat /run/secrets/nodered.txt | grep POSTGRES_PASSWORD)
    export $(cat /run/secrets/nodered.txt | grep POSTGRES_DB)
    export $(cat /run/secrets/nodered.txt | grep NODE_RED_ADMIN)
    export $(cat /run/secrets/nodered.txt | grep NODE_RED_ADMIN_HASH)    
fi


if [ -f "/run/configs/nodered.conf" ]
then
    export $(cat /run/configs/nodered.conf | grep PORT)
    export $(cat /run/configs/nodered.conf | grep DOMAIN_NAME)
fi 

npm --no-update-notifier --no-fund start --cache /data/.npm -- --userDir /data