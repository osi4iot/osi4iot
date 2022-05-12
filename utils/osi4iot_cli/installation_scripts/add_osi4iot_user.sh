#!/bin/sh

if ! id -u "osi4iot" >/dev/null 2>&1; then
    sudo useradd -m -s /bin/bash osi4iot
    sudo passwd osi4iot
    sudo usermod -aG sudo osi4iot
    sudo usermod -aG docker osi4iot
    echo "osi4iot ALL=(ALL:ALL) NOPASSWD: ALL" | sudo tee /etc/sudoers.d/osi4iot
    chmod 0440 /etc/sudoers.d/osi4iot
fi