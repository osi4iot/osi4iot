#!/bin/bash

echo "################################## Run template_script"

mv /tmp/settings.js /data
mv /tmp/ml_models.js /data
mv /tmp/pyodide_init.js /data
mv /tmp/python_libraries.js /data
if [ $IS_NODERED_INSTANCE_VOLUME_ALREADY_CREATED == "false" ]
then
    mv /tmp/flows.json /data

    search1=MQTT_CLIENT_ID
    replace1="Client_nri_$NODERED_INSTANCE_HASH"
    sed -i "s/${search1}/${replace1}/g" /data/flows.json

    search2=MQTT_TOPIC_TEST
    replace2="test/nri_$NODERED_INSTANCE_HASH"
    sed -i "s#${search2}#${replace2}#g"  /data/flows.json
fi

npm --no-update-notifier --no-fund start --cache /data/.npm -- --userDir /data
