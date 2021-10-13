#!/bin/bash

# echo RELOADAGENT | gpg-connect-agent >/dev/null
# gpg .env_aux.gpg >/dev/null 2>&1
# echo RELOADAGENT | gpg-connect-agent >/dev/null

# set -a
# #source <(cat .env | sed -e '/^#/d;/^\s*$/d' -e "s/'/'\\\''/g" -e "s/=\(.*\)/='\1'/g")
# #source <(cat .env | sed -e '/^#/d;/^\s*$/d' -e "s/'/'\\\''/g" | sed $'s/\r$//')
# source <(cat .env_aux | sed -e '/^#/d;/^\s*$/d' | sed $'s/\r$//')
# set +a
# rm .env_aux


# export POSTGRES_PASSWORD=$GENERIC_PASSWORD
# export PGADMIN_DEFAULT_PASSWORD=$GENERIC_PASSWORD
# export GRAFANA_ADMIN_PASSWORD=$GENERIC_PASSWORD

# SUDO=''
# if (( $EUID != 0 )); then SUDO='sudo'; fi
# which htpasswd >/dev/null || ($SUDO apt-get update && $SUDO apt-get install apache2-utils)
# USER=dicapua
# export HASHED_PASSWORD=$(htpasswd -nbB $USER $GENERIC_PASSWORD)
# echo $HASHED_PASSWORD

export $(cat ./config/admin_api/admin_api.conf | grep DOMAIN_NAME)
export NODE_ID=$(docker info -f '{{.Swarm.NodeID}}')

docker node update --label-add primary=true $NODE_ID

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

docker stack deploy -c docker-compose.swarm.yml osi4iot

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


do=true && [[ "$(docker ps | grep osi4iot/grafana | grep healthy)" != "" &&  "$(docker ps | grep osi4iot/timescaledb | grep healthy)" != "" ]] && do=false
printf '\n%s' "Initializing grafana database  "
while $do ; do
  spin
  do=true && [[ "$(docker ps | grep osi4iot/grafana | grep healthy)" != "" &&  "$(docker ps | grep osi4iot/timescaledb | grep healthy)" != "" ]] && do=false
  sleep 0.5
done
endspin
docker service scale osi4iot_admin_api=1

do=true && [[ "$(docker ps | grep osi4iot/admin_api | grep healthy)" != "" ]] && do=false
printf '\n%s' "Initializing platform database  "
while $do ; do
  spin
  do=true && [[ "$(docker ps | grep osi4iot/admin_api | grep healthy)" != "" ]] && do=false
  sleep 0.5
done
endspin
docker service scale osi4iot_admin_api=3

do=true && [[ "$(docker ps | grep starting)" == "" ]] && do=false
printf '\n%s' "Waiting until all containers be ready  "
while $do ; do
  spin
  do=true && [[ "$(docker ps | grep starting)" == "" ]] && do=false
  sleep 1
done
endspin

echo ""
echo "Removing unused containers and images:"
docker system prune --force
echo ""

echo ""
echo "OSI4IOT platform is ready!!!"
echo ""
