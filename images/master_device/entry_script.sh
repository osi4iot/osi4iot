#!/bin/sh

echo "################################## Run template_script"

mv /tmp/settings.js /data
mv /tmp/flows_cred.json /data

npm --no-update-notifier --no-fund start --cache /data/.npm -- --userDir /data
