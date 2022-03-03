#!/bin/bash

# echo RELOADAGENT | gpg-connect-agent >/dev/null
# gpg .env_aux.gpg >/dev/null 2>&1
# echo RELOADAGENT | gpg-connect-agent >/dev/null

# set -a
# source <(cat .env_images_tag | sed -e '/^#/d;/^\s*$/d' | sed $'s/\r$//')
# set +a

export TRAEFIK_TAG=1.1.0
export MOSQUITTO_TAG=1.1.0
export PORTAINER_AGENT_TAG=1.1.0
export PORTAINER_TAG=1.1.0
export PGADMIN4_TAG=1.1.0
export TIMESCALEDB_TAG=1.1.0
export NODERED_TAG=1.1.0
export NODERED_ARM64_TAG=1.1.0
export GRAFANA_TAG=1.1.0
export GRAFANA_RENDERER_TAG=1.1.0
export ADMIN_API_TAG=1.1.0
export FRONTEND_TAG=1.1.0
export FRONTEND_ARM64_TAG=1.1.0

NUMBER_OF_NODES=$(docker node ls | grep Active | wc -l)
PLATFORM_ARCH=x86_64
if [[ $(uname -a | grep aarch64) != "" ]]; then
  PLATFORM_ARCH=aarch64
fi

if [[ $NUMBER_OF_NODES > 1 ]]; then
    printf "Input nfs server ip: "
    read NFS_SERVER_IP
    export NFS_SERVER_IP=$NFS_SERVER_IP
    printf "Input username for the nfs server: "
    read NFS_USERNAME
    export NFS_USERNAME=$NFS_USERNAME
    printf "Input virtual ip: "
    read VIRTUAL_IP
    export VIRTUAL_IP=$VIRTUAL_IP
    printf "Input network inteface: "
    read NETWORK_INTERFACE
    export NETWORK_INTERFACE=$NETWORK_INTERFACE
fi

export $(cat ./config/admin_api/admin_api.conf | grep DOMAIN_NAME)
export NODE_ID=$(docker info -f '{{.Swarm.NodeID}}')
docker node update --label-add primary=true $NODE_ID

traefik_network=$(docker network ls | grep traefik_public)
if [[ "$traefik_network" == "" ]]; then
  docker network create -d overlay --opt encrypted=true traefik_public
fi

agent_network=$(docker network ls | grep agent_network)
if [[ "$agent_network" == "" ]]; then
  docker network create -d overlay --opt encrypted=true agent_network
fi


internal_network=$(docker network ls | grep internal_net)
if [[ "$internal_network" == "" ]]; then
  docker network create -d overlay --opt encrypted=true internal_net
fi

if [ ! -f osi4iot_stack.yml ]; then
  if [[ $NUMBER_OF_NODES == 1 ]]; then
    if [[ $PLATFORM_ARCH == x86_64 ]]; then
      wget -O osi4iot_stack.yml https://raw.githubusercontent.com/osi4iot/osi4iot/master/docker-compose.local_swarm.yml
    else
      wget -O osi4iot_stack.yml https://raw.githubusercontent.com/osi4iot/osi4iot/master/docker-compose.local_swarm_rpi.yml
    fi
  else
    if [[ $PLATFORM_ARCH == x86_64 ]]; then
      wget -O osi4iot_stack.yml https://raw.githubusercontent.com/osi4iot/osi4iot/master/docker-compose.cluster_swarm.yml
    else
      wget -O osi4iot_stack.yml https://raw.githubusercontent.com/osi4iot/osi4iot/master/docker-compose.cluster_swarm_rpi.yml
    fi
  fi
fi

if [[ $NUMBER_OF_NODES == 1 ]]; then
  nodered_volume=$(docker volume ls | grep nodered_data)
  if [[ "$nodered_volume" == "" ]]; then
    export IS_NODERED_VOLUME_ALREADY_CREATED=false
  else
    export IS_NODERED_VOLUME_ALREADY_CREATED=true
  fi
else
  nfshost=$NFS_USERNAME:$NFS_SERVER_IP
  if ssh $nfshost "test -e /path/to/file"; then
    export IS_NODERED_VOLUME_ALREADY_CREATED=false
  else
    export IS_NODERED_VOLUME_ALREADY_CREATED=true
  fi
fi

if [[ "$(docker service ls | grep osi4iot_admin_api | grep 3/3)" != "" ]]; then
  export ADMIN_API_REPLICAS=3
else
  export ADMIN_API_REPLICAS=0
fi

docker stack deploy --resolve-image changed -c osi4iot_stack.yml osi4iot
docker stack deploy --resolve-image changed -c master_devices_stack.yml masterdevs

sp="/-\|"
sc=0
spin() {
   printf "\b${sp:sc++:1}"
   ((sc==${#sp})) && sc=0
}
endspin() {
   printf "\r%s\n\n" "$@"
   tput cnorm
}


printf '\n%s' "Initializing grafana database  "
grafana_healthy=$(docker service ls | grep osi4iot_grafana | grep 3/3)
timescaledb_healthy=$(docker service ls | grep osi4iot_postgres | grep 1/1)
do=true && [[ $grafana_healthy != "" &&  $timescaledb_healthy != "" ]] && do=false
while $do ; do
  spin
  grafana_healthy=$(docker service ls | grep osi4iot_grafana | grep 3/3)
  timescaledb_healthy=$(docker service ls | grep osi4iot_postgres | grep 1/1)
  do=true && [[ $grafana_healthy != "" &&  $timescaledb_healthy != "" ]] && do=false
  sleep 0.5
done
endspin

if [[ "$(docker service ls | grep osi4iot_admin_api | grep 3/3)" == "" ]]; then
  echo "Initializing platform database:"
  echo ""
  docker service scale osi4iot_admin_api=1
  do=true && [[ "$(docker service ls | grep osi4iot_admin_api | grep 1/1)" != "" ]] && do=false
  while $do ; do
    spin
    do=true && [[ "$(docker service ls | grep osi4iot_admin_api | grep 1/1)" != "" ]] && do=false
    sleep 0.5
  done
  endspin

  # docker service scale osi4iot_admin_api=3
fi

do=true && [[ "$(docker service ls | grep 0/1)" == "" || "$(docker service ls | grep 0/3)" == "" ]] && do=false
printf '\n%s' "Waiting until all containers be ready  "
while $do ; do
  spin
  do=true && [[ "$(docker service ls | grep 0/1)" == "" || "$(docker service ls | grep 0/3)" == "" ]] && do=false
  sleep 1
done
endspin

echo ""
echo "Removing unused containers and images:"
echo ""
docker system prune --force
echo ""

echo ""
echo "OSI4IOT platform is ready!!!"
echo ""
