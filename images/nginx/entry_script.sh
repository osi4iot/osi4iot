#!/usr/bin/env bash

echo "################################## Run template_script"
export DOLLAR='$'
envsubst < /etc/nginx/templates/default.conf.template > /etc/nginx/nginx.conf
nginx -g "daemon off;"