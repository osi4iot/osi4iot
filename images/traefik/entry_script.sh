#!/bin/sh

echo "################################## Run template_script"

if [ -f "/run/secrets/traefic_aws.txt" ]
then
    export $(cat /run/secrets/traefic_aws.txt | grep AWS_ACCESS_KEY_ID)
    export $(cat /run/secrets/traefic_aws.txt | grep AWS_SECRET_ACCESS_KEY) 
fi

traefik

