#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

echo "################################## Run template_script"

# 1) Check if the NRI credentials are available
CREDENTIALS_FILE="/data/certs/nri_credentials"
if [[ -r "$CREDENTIALS_FILE" ]]; then
  echo "Loading NRI credentials from Docker secret"
  while IFS='=' read -r key value; do
    case "$key" in
      NRI_USERNAME|NRI_PASSWORD|NATS_NKEY_SEED)
        export "$key=$value"
        ;;
    esac
  done < <(grep -E '^(NRI_USERNAME|NRI_PASSWORD|NATS_NKEY_SEED)=' "$CREDENTIALS_FILE")
fi


# 2) Copy the static files to the data directory
for f in flows_cred.json settings.js  ml_models.js pyodide_init.js \
 python_libraries.js initialization.js; do
  cp /tmp/$f /data/
done

# 3) Only the first time we copy flows.json and adjust IDs
if [ ! -f /data/.initialized ]; then
  if [ "$MESSAGING_SYSTEM" = "mqtt" ]; then
      echo "Copying flows_mosquitto.json"
      cp /tmp/flows_mosquitto.json /data/flows.json
  elif [ "$MESSAGING_SYSTEM" = "nats" ]; then
      echo "Copying flows_nats.json"
      cp /tmp/flows_nats.json /data/flows.json
  fi

  # Dynamic replacements
  sed -i \
    -e "s/MQTT_CLIENT_ID/Client_nri_${NODERED_INSTANCE_HASH}/g" \
    -e "s#MQTT_TOPIC_TEST#test/nri_${NODERED_INSTANCE_HASH}#g" \
    /data/flows.json

  # Create the flag to avoid repeating it
  touch /data/.initialized

  # Adjust permissions
  chown node-red:node-red /data/flows.json /data/.initialized
fi

# 4) Start Node-RED with the data directory
exec npm --no-update-notifier --no-fund start --cache /data/.npm -- --userDir /data

