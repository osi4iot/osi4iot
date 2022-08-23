import { execSync } from 'child_process';
import clc from 'cli-color';

export default function (dockerHost, nodesData, organizations, updateAllServices = false) {
    if (updateAllServices) {
        try {
            const servicesIdArray = execSync(`docker ${dockerHost} stack services -q osi4iot`).toString().split("\n");
            for (const serviceId of servicesIdArray) {
                execSync(`docker ${dockerHost} service update --force ${serviceId}`, { stdio: 'inherit' })
            }
        } catch (err) {
            console.log(clc.redBright(`Error updating services in the swarm:`, err.toString()));
        }
    } else {
        const serviceNames = [];
        for (let inode = 0; inode < nodesData.length; inode++) {
            const nodeRole = nodesData[inode].nodeRole;
            const nodeHostName = nodesData[inode].nodeHostName;
            if (nodeRole === "Manager") {
                const managerServices = ["osi4iot_agent", "osi4iot_grafana", "osi4iot_portainer", "osi4iot_traefik"];
                serviceNames.push(...managerServices);
            } else if (nodeRole === "Platform worker") {
                const managerServices = [
                    "osi4iot_agent",
                    "osi4iot_admin_api",
                    "osi4iot_frontend",
                    "osi4iot_grafana_renderer",
                    "osi4iot_mosquitto",
                ];
                serviceNames.push(...managerServices);
            } else if (nodeRole === "Generic org worker") {
                const orgWithGenericWorkers = organizations.filter(org => org.exclusiveWorkerNodes.length === 0);
                for (const org of orgWithGenericWorkers) {
                    for (const md of org.master_devices) {
                        const serviceName = `osi4iot_org_${org.org_acronym}_md_${md.md_hash}`;
                        serviceNames.push(serviceName);
                    }
                }
            } else if (nodeRole === "Exclusive org worker") {
                const orgWithExcluisveWorkers = organizations.filter(org => org.exclusiveWorkerNodes.includes(nodeHostName));
                for (const org of orgWithExcluisveWorkers) {
                    for (const md of org.master_devices) {
                        const serviceName = `osi4iot_org_${org.org_acronym}_md_${md.md_hash}`;
                        serviceNames.push(serviceName);
                    }
                }
            }
        }

        try {
            for (const serviceName of serviceNames) {
                execSync(`docker ${dockerHost} service update --force ${serviceName}`, { stdio: 'inherit' })
            }
        } catch (err) {
            console.log(clc.redBright(`Error updating services in the swarm:`, err.toString()));
        }
    }
}