#!/bin/sh

org_acronym=$1
nri_hashes_array=($(echo "$2" | tr ',' '\n'))

for (( i=0; i < ${#nri_hashes_array[@]}; i++ )); do
    nri_folder="/home/ubuntu/efs_osi4iot/org_${org_acronym}_nri_${nri_hashes_array[$i]}_data"
    if [ ! -d  $nri_folder ]; then
        sudo mkdir $nri_folder
        sudo chown ubuntu:ubuntu $nri_folder
    fi
done