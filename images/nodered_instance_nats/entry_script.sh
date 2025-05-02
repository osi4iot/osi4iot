#!/bin/bash
set -e

# 1) Copy the static files to the data directory
for f in flows_cred.json flows_mosquitto.json flows_nats.json settings.js  \
  ml_models.js pyodide_init.js python_libraries.js initialization.js; do
  cp /tmp/$f /data/
done

# 2) Only the first time we copy flows.json and adjust IDs
if [ ! -f /data/.initialized ]; then
  if [ MESSAGING_BROKER = "mosquitto" ]; then
    cp /tmp/flows_mosquitto.json /data/flows.json
      # Dynamic replacements
    sed -i \
      -e "s/MQTT_CLIENT_ID/Client_nri_${NODERED_INSTANCE_HASH}/g" \
      -e "s#MQTT_TOPIC_TEST#test/nri_${NODERED_INSTANCE_HASH}#g" \
      /data/flows.json
  elif [ MESSAGING_BROKER = "nats" ]; then
    cp /tmp/flows_nats.json /data/flows.json
  fi
  # Create the flag to avoid repeating it
  touch /data/.initialized

  # Adjust permissions
  chown node-red:node-red /data/flows.json /data/.initialized
fi

# 3) Start Node-RED with the data directory
exec npm --no-update-notifier --no-fund start --cache /data/.npm -- --userDir /data

