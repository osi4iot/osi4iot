#!/bin/bash

echo "################################## Run template_script"

mv /tmp/settings.js /data
if [ $IS_MASTER_DEVICE_VOLUME_ALREADY_CREATED == "false" ]
then
    mv /tmp/flows.json /data

    search1=MQTT_CLIENT_ID
    replace1="Client_master_device_$MASTER_DEVICE_HASH"
    sed -i "s/${search1}/${replace1}/g" /data/flows.json

    search2=MQTT_TOPIC_TEST
    replace2="master_device_$MASTER_DEVICE_HASH/test"
    sed -i "s#${search2}#${replace2}#g"  /data/flows.json
fi

npm --no-update-notifier --no-fund start --cache /data/.npm -- --userDir /data
