#!/bin/sh

user="${1:-osi4iot}"

if ! id -u $user >/dev/null 2>&1; then
    sudo useradd -m -s /bin/bash $user
    sudo passwd $user
    sudo usermod -aG sudo $user
    sudo usermod -aG docker $user
    echo "$user ALL=(ALL:ALL) NOPASSWD: ALL" | sudo tee "/etc/sudoers.d/$user"
    sudo chmod 0440 "/etc/sudoers.d/$user"
fi