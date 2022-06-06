#!/bin/bash

admin_email=$1
if [ ! -d ~/.acme.sh/ ]; then
    git clone https://github.com/acmesh-official/acme.sh.git
    cd ./acme.sh
    ./acme.sh --install -m $admin_email
    ./acme.sh --uninstall-cronjob
    cd ..
    rm -rf ./acme.sh
fi