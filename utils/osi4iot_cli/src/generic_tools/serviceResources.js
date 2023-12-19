export const giveCPUs = (service, numSwarmNodes, numCpuPerNode) => {
    let cpus = '0.25';
    switch (service) {
        case 'system_prune':
            cpus = '0.25';
            break;
        case 'traefik':
            if (numSwarmNodes === 1) {
                if (numCpuPerNode === "4") {
                    cpus = '0.15';
                } else {
                    cpus = '0.25';
                }
            } else {
                cpus = '0.50';
            }
            break;
        case 'mosquitto_go_auth':
            if (numSwarmNodes === 1) {
                if (numCpuPerNode === "4") {
                    cpus = '0.30';
                } else {
                    cpus = '0.50';
                }
            } else {
                cpus = '0.50';
            }
            break;
        case 'postgres':
            if (numSwarmNodes === 1) {
                if (numCpuPerNode === "4") {
                    cpus = '0.25';
                } else {
                    cpus = '0.50';
                }
            } else {
                cpus = '0.50';
            }
            break;
        case 'timescaledb':
            if (numSwarmNodes === 1) {
                if (numCpuPerNode === "4") {
                    cpus = '0.25';
                } else {
                    cpus = '0.50';
                }
            } else {
                cpus = '0.50';
            }
            break;
        case 's3_storage':
            if (numSwarmNodes === 1) {
                if (numCpuPerNode === "4") {
                    cpus = '0.15';
                } else {
                    cpus = '0.25';
                }
            } else {
                cpus = '0.50';
            }
            break;
        case 'dev2pdb':
            if (numSwarmNodes === 1) {
                if (numCpuPerNode === "4") {
                    cpus = '0.25';
                } else {
                    cpus = '0.25';
                }
            } else {
                cpus = '0.50';
            }
            break;
        case 'grafana':
            if (numSwarmNodes === 1) {
                if (numCpuPerNode === "4") {
                    cpus = '0.25';
                } else {
                    cpus = '0.50';
                }
            } else {
                cpus = '0.50';
            }
            break;
        case 'admin_api':
            if (numSwarmNodes === 1) {
                if (numCpuPerNode === "4") {
                    cpus = '0.30';
                } else {
                    cpus = '0.50';
                }
            } else {
                cpus = '0.50';
            }
            break;
        case 'frontend':
            if (numSwarmNodes === 1) {
                if (numCpuPerNode === "4") {
                    cpus = '0.25';
                } else {
                    cpus = '0.25';
                }
            } else {
                cpus = '0.50';
            }
            break;
        case 'agent':
            cpus = '0.10';
            break;
        case 'portainer':
            cpus = '0.10';
            break;
        case 'pgadmin4':
            if (numSwarmNodes === 1) {
                if (numCpuPerNode === "4") {
                    cpus = '0.15';
                } else {
                    cpus = '0.25';
                }
            } else {
                cpus = '0.25';
            }
            break;
        case 'minio':
            if (numSwarmNodes === 1) {
                if (numCpuPerNode === "4") {
                    cpus = '0.30';
                } else {
                    cpus = '0.50';
                }
            } else {
                cpus = '0.50';
            }
            break;
        case 'grafana_renderer':
            if (numSwarmNodes === 1) {
                if (numCpuPerNode === "4") {
                    cpus = '0.25';
                } else {
                    cpus = '0.50';
                }
            } else {
                cpus = '0.50';
            }
            break;
        case 'keepalived':
            cpus = '0.25';
            break;
        case 'nodered_instance':
            cpus = '0.50';
            break;
        default:
            cpus = '0.25';
    }
    return cpus;
}

export const giveMemory = (service, memoryPerNode) => {
    let memory = "100M";
    switch (service) {
        case 'system_prune':
            memory = "50M";
            break;
        case 'traefik':
            memory = "250M";
            break;
        case 'mosquitto_go_auth':
            memory = "500M";
            break;
            break;
        case 'postgres':
            memory = "500M";
            break;
        case 'timescaledb':
            memory = "500M";
            break;
        case 's3_storage':
            memory = "250M";
            break;
        case 'dev2pdb':
            memory = "500M";
            break;
        case 'grafana':
            memory = "500M";
            break;
        case 'admin_api':
            memory = "1000M";
            break;
        case 'frontend':
            memory = "500M";
            break;
        case 'agent':
            memory = "100M";
            break;
        case 'portainer':
            memory = "100M";
            break;
        case 'pgadmin4':
            memory = "500M";
            break;
        case 'minio':
            memory = "500M";
            break;
        case 'grafana_renderer':
            memory = "500M";
            break;
        case 'keepalived':
            memory = "50M";
            break;
        case 'nodered_instance':
            if (memoryPerNode === "4 GiB" || memoryPerNode === "8 GiB") {
                memory = "2048M";
            } else if (memoryPerNode === "16 GiB" || memoryPerNode === "32 GiB"){
                memory = "4096M";
            }
            break;
        default:
            memory = "100M";
    }
    return memory;
}