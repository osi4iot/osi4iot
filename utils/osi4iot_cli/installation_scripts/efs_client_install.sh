#!/bin/bash

efs_dns=$1

if [ ! -d /home/ubuntu/efs_osi4iot ]; then
    sudo mkdir /home/ubuntu/efs_osi4iot
    sudo chown ubuntu:ubuntu /home/ubuntu/efs_osi4iot
    echo "$efs_dns:/ /home/ubuntu/efs_osi4iot nfs4 nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport,_netdev 0 0" >> /etc/fstab
    sudo mount -a
fi

if [ ! -d /home/ubuntu/efs_osi4iot/admin_api_log ]; then
    sudo mkdir /home/ubuntu/efs_osi4iot/admin_api_log
    sudo chown ubuntu:ubuntu /home/ubuntu/efs_osi4iot/admin_api_log
fi

if [ ! -d /home/ubuntu/efs_osi4iot/grafana_data ]; then
    sudo mkdir /home/ubuntu/efs_osi4iot/grafana_data
    sudo chown ubuntu:ubuntu /home/ubuntu/efs_osi4iot/grafana_data
fi

if [ ! -d /home/ubuntu/efs_osi4iot/mosquitto_data ]; then
    sudo mkdir /home/ubuntu/efs_osi4iot/mosquitto_data
    sudo chown ubuntu:ubuntu /home/ubuntu/efs_osi4iot/mosquitto_data
fi

if [ ! -d /home/ubuntu/efs_osi4iot/mosquitto_log ]; then
    sudo mkdir /home/ubuntu/efs_osi4iot/mosquitto_log
    sudo chown ubuntu:ubuntu /home/ubuntu/efs_osi4iot/mosquitto_log
fi

if [ ! -d  /home/ubuntu/efs_osi4iot/nodered_data ]; then
    sudo mkdir /home/ubuntu/efs_osi4iot/nodered_data
    sudo chown ubuntu:ubuntu /home/ubuntu/efs_osi4iot/nodered_data
fi

if [ ! -d  /home/ubuntu/efs_osi4iot/portainer_data ]; then
    sudo mkdir /home/ubuntu/efs_osi4iot/portainer_data
    sudo chown ubuntu:ubuntu /home/ubuntu/efs_osi4iot/portainer_data
fi

if [ ! -d  /home/ubuntu/efs_osi4iot/pgadmin4_data ]; then
    sudo mkdir /home/ubuntu/efs_osi4iot/pgadmin4_data
    sudo chown ubuntu:ubuntu /home/ubuntu/efs_osi4iot/pgadmin4_data
fi

if [ ! -d  /home/ubuntu/efs_osi4iot/pgdata ]; then
    sudo mkdir /home/ubuntu/efs_osi4iot/pgdata
    sudo chown ubuntu:ubuntu /home/ubuntu/efs_osi4iot/pgdata
fi

if [ ! -d  /home/ubuntu/efs_osi4iot/pgdata ]; then
    sudo mkdir /home/ubuntu/efs_osi4iot/portainer_data
    sudo chown ubuntu:ubuntu /home/ubuntu/efs_osi4iot/portainer_data
fi

