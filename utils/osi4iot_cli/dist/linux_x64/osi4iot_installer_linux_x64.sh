#!/bin/bash

branch=$1
if [ -z "$branch" ]
then
    branch=master
fi

url=https://raw.githubusercontent.com/osi4iot/osi4iot/$branch/utils/osi4iot_cli/dist/linux_x64/osi4iot

if curl --head --fail --silent "$url" >/dev/null; then
    echo "Downloading osi4iot_cli..."
    curl -o osi4iot "$url" &> /dev/null
    echo "osi4iot_cli downloaded."
    sudo mv osi4iot /usr/local/bin/osi4iot
    sudo chmod +x /usr/local/bin/osi4iot
    echo "osi4iot_cli installed."
fi