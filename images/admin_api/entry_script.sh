#!/bin/sh

echo "################################## Run template_script"

if [ -f "/run/secrets/admin_api.txt" ]
then
    export $(cat /run/secrets/admin_api.txt | grep REGISTRATION_TOKEN_LIFETIME)
    export $(cat /run/secrets/admin_api.txt | grep REFRESH_TOKEN_LIFETIME)
    export $(cat /run/secrets/admin_api.txt | grep REFRESH_TOKEN_SECRET)
    export $(cat /run/secrets/admin_api.txt | grep ACCESS_TOKEN_SECRET)
    export $(cat /run/secrets/admin_api.txt | grep ACCESS_TOKEN_LIFETIME)
    export $(cat /run/secrets/admin_api.txt | grep MQTT_SSL_CERTS_VALIDITY_DAYS)
    export $(cat /run/secrets/admin_api.txt | grep ENCRYPTION_SECRET_KEY)
    PLATFORM_ADMIN_FIRST_NAME_LINE=$(cat /run/secrets/admin_api.txt | grep PLATFORM_ADMIN_FIRST_NAME)
    export PLATFORM_ADMIN_FIRST_NAME=$(echo $PLATFORM_ADMIN_FIRST_NAME_LINE | sed -e 's/^[^=]*=//' | sed -e 's/"//g')
    PLATFORM_ADMIN_SURNAME_LINE=$(cat /run/secrets/admin_api.txt | grep PLATFORM_ADMIN_SURNAME)
    export PLATFORM_ADMIN_SURNAME=$(echo $PLATFORM_ADMIN_SURNAME_LINE | sed -e 's/^[^=]*=//' | sed -e 's/"//g')
    export $(cat /run/secrets/admin_api.txt | grep PLATFORM_ADMIN_USER_NAME)
    export $(cat /run/secrets/admin_api.txt | grep PLATFORM_ADMIN_EMAIL)
    export $(cat /run/secrets/admin_api.txt | grep PLATFORM_ADMIN_PASSWORD)
    export $(cat /run/secrets/admin_api.txt | grep PLATFORM_ADMIN_TELEGRAM_ID)
    export $(cat /run/secrets/admin_api.txt | grep GRAFANA_ADMIN_PASSWORD)
    export $(cat /run/secrets/admin_api.txt | grep POSTGRES_USER)
    export $(cat /run/secrets/admin_api.txt | grep POSTGRES_PASSWORD)
    export $(cat /run/secrets/admin_api.txt | grep POSTGRES_DB)
    export $(cat /run/secrets/admin_api.txt | grep NOTIFICATIONS_EMAIL_USER)
    export $(cat /run/secrets/admin_api.txt | grep NOTIFICATIONS_EMAIL_PASSWORD)    
fi

if [ -f "/run/configs/admin_api.conf" ]
then
    export $(cat /run/configs/admin_api.conf | grep DOMAIN_NAME)
    PLATFORM_NAME_LINE=$(cat /run/configs/admin_api.conf | grep PLATFORM_NAME)
    export PLATFORM_NAME=$(echo $PLATFORM_NAME_LINE | sed -e 's/^[^=]*=//' | sed -e 's/"//g')
    PLATFORM_PHRASE_LINE=$(cat /run/configs/admin_api.conf | grep PLATFORM_PHRASE)
    export PLATFORM_PHRASE=$(echo $PLATFORM_PHRASE_LINE | sed -e 's/^[^=]*=//' | sed -e 's/"//g')    
    MAIN_ORGANIZATION_NAME_LINE=$(cat /run/configs/admin_api.conf | grep MAIN_ORGANIZATION_NAME)
    export MAIN_ORGANIZATION_NAME=$(echo $MAIN_ORGANIZATION_NAME_LINE | sed -e 's/^[^=]*=//' | sed -e 's/"//g')
    MAIN_ORGANIZATION_ACRONYM_LINE=$(cat /run/configs/admin_api.conf | grep MAIN_ORGANIZATION_ACRONYM)
    export MAIN_ORGANIZATION_ACRONYM=$(echo $MAIN_ORGANIZATION_ACRONYM_LINE | sed -e 's/^[^=]*=//' | sed -e 's/"//g')
    MAIN_ORGANIZATION_ADDRESS1_LINE=$(cat /run/configs/admin_api.conf | grep MAIN_ORGANIZATION_ADDRESS1)
    export MAIN_ORGANIZATION_ADDRESS1=$(echo $MAIN_ORGANIZATION_ADDRESS1_LINE | sed -e 's/^[^=]*=//' | sed -e 's/"//g')
    MAIN_ORGANIZATION_CITY_LINE=$(cat /run/configs/admin_api.conf | grep MAIN_ORGANIZATION_CITY)
    export MAIN_ORGANIZATION_CITY=$(echo $MAIN_ORGANIZATION_CITY_LINE | sed -e 's/^[^=]*=//' | sed -e 's/"//g')
    export $(cat /run/configs/admin_api.conf | grep MAIN_ORGANIZATION_ZIP_CODE)
    MAIN_ORGANIZATION_STATE_LINE=$(cat /run/configs/admin_api.conf | grep MAIN_ORGANIZATION_STATE)
    export MAIN_ORGANIZATION_STATE=$(echo $MAIN_ORGANIZATION_STATE_LINE | sed -e 's/^[^=]*=//' | sed -e 's/"//g')
    MAIN_ORGANIZATION_COUNTRY_LINE=$(cat /run/configs/admin_api.conf | grep MAIN_ORGANIZATION_COUNTRY)
    export MAIN_ORGANIZATION_COUNTRY=$(echo $MAIN_ORGANIZATION_COUNTRY_LINE | sed -e 's/^[^=]*=//' | sed -e 's/"//g')   
fi 

npm start