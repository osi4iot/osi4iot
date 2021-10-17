#!/bin/bash

# echo RELOADAGENT | gpg-connect-agent >/dev/null
# gpg .env_aux.gpg >/dev/null 2>&1
# echo RELOADAGENT | gpg-connect-agent >/dev/null

set -a
source <(cat .env_images_tag | sed -e '/^#/d;/^\s*$/d' | sed $'s/\r$//')
set +a


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


printf '\n%s' "Initializing grafana database  "
do=true && [[ "$(docker ps | grep osi4iot/grafana | grep healthy)" != "" &&  "$(docker ps | grep osi4iot/timescaledb | grep healthy)" != "" ]] && do=false
while $do ; do
  spin
  do=true && [[ "$(docker ps | grep osi4iot/grafana | grep healthy)" != "" &&  "$(docker ps | grep osi4iot/timescaledb | grep healthy)" != "" ]] && do=false
  sleep 0.5
done
endspin

echo "Initializing platform database:"
echo ""
docker service scale osi4iot_admin_api=1
do=true && [[ "$(docker ps | grep osi4iot/admin_api | grep healthy)" != "" ]] && do=false
while $do ; do
  spin
  do=true && [[ "$(docker ps | grep osi4iot/admin_api | grep healthy)" != "" ]] && do=false
  sleep 0.5
done
endspin

echo ""
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
echo ""
docker system prune --force
echo ""

echo ""
echo "OSI4IOT platform is ready!!!"
echo ""
