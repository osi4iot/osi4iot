#!/bin/bash

pwd=$1
admin_email=$2
if [ ! -d $pwd/.acme.sh/ ]; then
    git clone https://github.com/acmesh-official/acme.sh.git
    $pwd/acme.sh/acme.sh --install -m $admin_email
    $pwd/acme.sh/acme.sh --uninstall-cronjob
    rm -rf $pwd/acme.sh
fi