#!/bin/bash

## declare env keys array variable
declare -a env_keys_array=( "PLATFORM_NAME" "DOMAIN_NAME" "PROTOCOL" "DEPLOYMENT_LOCATION" "DEPLOYMENT_MODE" "MIN_LONGITUDE" "MAX_LONGITUDE" "MIN_LATITUDE" "MAX_LATITUDE" )

# Recreate config file
rm -rf /static/env-config.js
cd /static
touch ./env-config.js

# Add assignment 
echo "window._env_ = {" >> ./env-config.js

## Loop through the above array
for env_key in "${env_keys_array[@]}"
do

  if [ -f "/run/configs/frontend.conf" ]
  then
    line=$(cat /run/configs/frontend.conf | grep $env_key)
  else
    line=$(env | grep $env_key)
  fi
   
  # Split env variables by character `=`
  if printf '%s\n' "$line" | grep -q -e '='; then
    varname=$(printf '%s\n' "$line" | sed -e 's/=.*//')
    varvalue=$(printf '%s\n' "$line" | sed -e 's/^[^=]*=//' | sed 's/"//g')
  fi

  # Read value of current variable if exists as Environment variable
  value=$(printf '%s\n' "${!varname}")
  # Otherwise use value from .env file
  [[ -z $value ]] && value=${varvalue}
  
  # Append configuration property to JS file
  echo "  $varname: \"$value\"," >> ./env-config.js
done

echo "}" >> ./env-config.js

nginx -g "daemon off;"