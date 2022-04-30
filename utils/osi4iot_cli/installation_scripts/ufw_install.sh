#!/bin/bash

node_role=$1


REQUIRED_PKG="ufw"
if [ $(dpkg-query -W -f='${Status}' $REQUIRED_PKG 2>/dev/null | grep -c "ok installed") -eq 0 ];
then
    sudo apt-get update -y
    sudo apt-get install ufw -y
fi

if [[ $node_role == "Manager" ]]; then
    ufw allow 22/tcp
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw allow 2377/tcp
    ufw allow 7946/tcp 
    ufw allow 7946/udp 
    ufw allow 4789/udp
elif [[ $node_role == "Platform worker" ]]; then
    ufw allow 22/tcp
    ufw allow 1883/tcp
    ufw allow 8883/tcp
    ufw allow 9001/tcp
    ufw allow 2377/tcp
    ufw allow 7946/tcp 
    ufw allow 7946/udp 
    ufw allow 4789/udp
elif [[ $node_role == "Generic org worker" || $node_role == "Exclusive org worker" ]]; then
    ufw allow 22/tcp
    ufw allow 2377/tcp
    ufw allow 7946/tcp 
    ufw allow 7946/udp 
    ufw allow 4789/udp
elif [[ $node_role == "NFS server" ]]; then
    ufw allow 22/tcp
    ufw allow 2049/tcp
fi

sudo ufw enable