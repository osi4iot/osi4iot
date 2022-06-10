org_acronym=$1
md_hashes_array=($(echo "$2" | tr ',' '\n'))

for (( i=0; i < ${#md_hashes_array[@]}; i++ )); do
    md_folder="/home/ubuntu/efs_osi4iot/org_${org_acronym}_md_${md_hashes_array[$i]}_data"
    if [ -d  $md_folder ]; then
        sudo rm -rf $md_folder
    fi
done

sudo systemctl restart nfs-kernel-server