#!/bin/bash

admin_email=$1
if [ ! -d ./.acme.sh/ ]; then
    git clone https://github.com/acmesh-official/acme.sh.git
    ./acme.sh/acme.sh --install -m $admin_email
    ./acme.sh/acme.sh --uninstall-cronjob
    rm -rf ./acme.sh
fi