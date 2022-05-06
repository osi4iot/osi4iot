#!/bin/bash

echo "Downloading osi4iot_cli..."
curl -o osi4iot https://raw.githubusercontent.com/osi4iot/osi4iot/master/utils/osi4iot_cli/dist/linux_x64/osi4iot &> /dev/null
echo "osi4iot_cli downloaded."
sudo mv osi4iot /usr/local/bin/osi4iot
sudo chmod +x /usr/local/bin/osi4iot