#!/bin/bash

ips_array=($(echo "$1" | tr ',' '\n'))

REQUIRED_PKG="nfs-kernel-server"
if [ $(dpkg-query -W -f='${Status}' $REQUIRED_PKG 2>/dev/null | grep -c "ok installed") -eq 0 ];
then
    sudo apt-get update -y
    sudo apt-get install nfs-kernel-server -y
fi

if [ ! -d /var/nfs_osi4iot ]; then
    sudo mkdir /var/nfs_osi4iot
    sudo chown nobody:nogroup /var/nfs_osi4iot
fi

if [ ! -d /var/nfs_osi4iot/admin_api_log ]; then
    sudo mkdir /var/nfs_osi4iot/admin_api_log
    sudo chown nobody:nogroup /var/nfs_osi4iot/admin_api_log
fi

if [ ! -d /var/nfs_osi4iot/grafana_data ]; then
    sudo mkdir /var/nfs_osi4iot/grafana_data
    sudo chown nobody:nogroup /var/nfs_osi4iot/grafana_data
fi

if [ ! -d /var/nfs_osi4iot/mosquitto_data ]; then
    sudo mkdir /var/nfs_osi4iot/mosquitto_data
    sudo chown nobody:nogroup /var/nfs_osi4iot/mosquitto_data
fi

if [ ! -d /var/nfs_osi4iot/mosquitto_log ]; then
    sudo mkdir /var/nfs_osi4iot/mosquitto_log
    sudo chown nobody:nogroup /var/nfs_osi4iot/mosquitto_log
fi

if [ ! -d  /var/nfs_osi4iot/nodered_data ]; then
    sudo mkdir /var/nfs_osi4iot/nodered_data
    sudo chown nobody:nogroup /var/nfs_osi4iot/nodered_data
fi

if [ ! -d  /var/nfs_osi4iot/portainer_data ]; then
    sudo mkdir /var/nfs_osi4iot/portainer_data
    sudo chown nobody:nogroup /var/nfs_osi4iot/portainer_data
fi

if [ ! -d  /var/nfs_osi4iot/pgadmin4_data ]; then
    sudo mkdir /var/nfs_osi4iot/pgadmin4_data
    sudo chown nobody:nogroup /var/nfs_osi4iot/pgadmin4_data
fi

if [ ! -d  /var/nfs_osi4iot/pgdata ]; then
    sudo mkdir /var/nfs_osi4iot/pgdata
    sudo chown nobody:nogroup /var/nfs_osi4iot/pgdata
fi

if [ ! -d  /var/nfs_osi4iot/pgdata ]; then
    sudo mkdir /var/nfs_osi4iot/portainer_data
    sudo chown nobody:nogroup /var/nfs_osi4iot/portainer_data
fi


for (( i=0; i<${#ips_array[@]}; i++ )); do
    newline="/var/nfs ${ips_array[$i]}(rw,sync,no_root_squash,no_subtree_check)"
    if ! grep -Fxq "$newline" "/etc/exports"; then
        echo $newline >> /etc/exports
    fi
done

sudo systemctl restart nfs-kernel-server
