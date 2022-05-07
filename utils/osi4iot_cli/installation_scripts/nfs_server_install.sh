#!/bin/bash

ips_array=($(echo "$1" | tr ',' '\n'))

REQUIRED_PKG="nfs-kernel-server"
if [ $(dpkg-query -W -f='${Status}' $REQUIRED_PKG 2>/dev/null | grep -c "ok installed") -eq 0 ];
then
    sudo apt-get update -y
    sudo apt-get install nfs-kernel-server -y
fi

if [ ! -d /var/nfs ]; then
    sudo mkdir /var/nfs
    sudo chown nobody:nogroup /var/nfs
fi

if [ ! -d /var/nfs/admin_api_log ]; then
    sudo mkdir /var/nfs/admin_api_log
    sudo chown nobody:nogroup /var/nfs/admin_api_log
fi

if [ ! -d /var/nfs/grafana_data ]; then
    sudo mkdir /var/nfs/grafana_data
    sudo chown nobody:nogroup /var/nfs/grafana_data
fi

if [ ! -d /var/nfs/mosquitto_data ]; then
    sudo mkdir /var/nfs/mosquitto_data
    sudo chown nobody:nogroup /var/nfs/mosquitto_data
fi

if [ ! -d /var/nfs/mosquitto_log ]; then
    sudo mkdir /var/nfs/mosquitto_log
    sudo chown nobody:nogroup /var/nfs/mosquitto_log
fi

if [ ! -d  /var/nfs/nodered_data ]; then
    sudo mkdir /var/nfs/nodered_data
    sudo chown nobody:nogroup /var/nfs/nodered_data
fi

if [ ! -d  /var/nfs/pgadmin4_data ]; then
    sudo mkdir /var/nfs/pgadmin4_data
    sudo chown nobody:nogroup /var/nfs/pgadmin4_data
fi

if [ ! -d  /var/nfs/pgdata ]; then
    sudo mkdir /var/nfs/pgdata
    sudo chown nobody:nogroup /var/nfs/pgdata
fi

if [ ! -d  /var/nfs/pgdata ]; then
    sudo mkdir /var/nfs/portainer_data
    sudo chown nobody:nogroup /var/nfs/portainer_data
fi


for (( i=0; i<${#ips_array[@]}; i++ )); do
    newline="/var/nfs ${ips_array[$i]}(rw,sync,no_root_squash,no_subtree_check)"
    if ! grep -Fxq "$newline" "/etc/exports"; then
        echo $newline >> /etc/exports
    fi
done

sudo systemctl restart nfs-kernel-server
