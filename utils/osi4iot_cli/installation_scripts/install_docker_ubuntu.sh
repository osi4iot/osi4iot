#!/bin/sh

if [[ $(which docker) && $(docker --version) ]]; then
    echo "Docker is already installed."
    # command
  else
   # Update the apt package index and install packages to allow apt to use a repository over HTTPS:
   sudo apt-get update
   sudo apt-get install ca-certificates curl gnupg lsb-release -y

   #Add Docker’s official GPG key:
   curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

   #Set up the stable repository
   echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

  #Update the apt package index, and install the latest version of Docker Engine, containerd, and Docker Compose, or go to the next step to install a specific version:
  sudo apt-get update
  sudo apt-get install docker-ce docker-ce-cli containerd.io docker-compose-plugin -y

  # Run Docker command without sudo
  sudo groupadd docker
  sudo usermod -aG docker $USER
fi
