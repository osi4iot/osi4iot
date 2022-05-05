#!/bin/bash

curl -o osi4iot https://raw.githubusercontent.com/osi4iot/osi4iot/master/utils/osi4iot_cli/dist/linux_arm64/osi4iot
sudo mv osi4iot /usr/local/bin/osi4iot
sudo chmod +x /usr/local/bin/osi4iot