#!/bin/bash
set -a
#source <(cat .env | sed -e '/^#/d;/^\s*$/d' -e "s/'/'\\\''/g" -e "s/=\(.*\)/='\1'/g")
source <(cat .env | sed -e '/^#/d;/^\s*$/d' -e "s/'/'\\\''/g" | sed $'s/\r$//') 
set +a

export POSTGRES_PASSWORD=$GENERIC_PASSWORD
export PGADMIN_DEFAULT_PASSWORD=$GENERIC_PASSWORD
export GRAFANA_ADMIN_PASSWORD=$GENERIC_PASSWORD

# SUDO=''
# if (( $EUID != 0 )); then SUDO='sudo'; fi
# which htpasswd >/dev/null || ($SUDO apt-get update && $SUDO apt-get install apache2-utils)
# USER=dicapua
# export HASHED_PASSWORD=$(htpasswd -nbB $USER $GENERIC_PASSWORD)
# echo $HASHED_PASSWORD

export NODE_ID=$(docker info -f '{{.Swarm.NodeID}}')


traefik_network=$(docker network ls | grep traefik-public)
if [[ "$traefik_network" == "" ]]; then
    docker network create -d overlay --opt encrypted=true traefik-public
fi

agent_network=$(docker network ls | grep agent_network)
if [[ "$agent_network" == "" ]]; then
    docker network create -d overlay --opt encrypted=true agent_network
fi

internal_network=$(docker network ls | grep internal_net)
if [[ "$internal_network" == "" ]]; then
    docker network create -d overlay --opt encrypted=true internal_net
fi

docker stack deploy -c docker-compose.swarm.yml osi4iot_stack
