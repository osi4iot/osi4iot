import clc from "cli-color";
import Table from 'cli-table3';

export default async function (osi4iotState) {
    const nodesData = osi4iotState.platformInfo.NODES_DATA;
    const orgsInNodes = {};
    const organizations = osi4iotState.certs.mqtt_certs.organizations;
    const orgsInGenericWorkers = [];
    for (const org of organizations) {
        if (org.exclusiveWorkerNodes.length !== 0) {
            for (const orgWorkerName of org.exclusiveWorkerNodes) {
                if (orgsInNodes[orgWorkerName] === undefined) {
                    orgsInNodes[orgWorkerName] = [];
                }
                orgsInNodes[orgWorkerName].push(org.org_acronym);
            }
        } else {
            orgsInGenericWorkers.push(org.org_acronym);
        }
    }


    const table = new Table({
        head: [
            clc.cyanBright('Index'),
            clc.cyanBright('Hostname'),
            clc.cyanBright('IP'),
            clc.cyanBright('Username'),
            clc.cyanBright('Architecture'),
            clc.cyanBright('Role'),
            clc.cyanBright('Organizations'),
        ],
        colWidths: [8, 20, 17, 25, 14, 23, 25],
        wordWrap: true,
        style: { 'padding-left': 1, 'padding-right': 1 }
    });


    let index = 0;
    for (const nodeData of nodesData) {
        index++;
        let orgs;
        if (nodeData.nodeRole === "Generic org worker") {
            orgs = orgsInGenericWorkers.join(", ");
        } else if (nodeData.nodeRole === "Exclusive org worker") {
            orgs = orgsInNodes[nodeData.nodeHostName].join(", ");
        } else {
            orgs = "-";
            if (nodesData.length === 1) {
                orgs = "All orgs";
            }
        }
        const row = [
            index,
            nodeData.nodeHostName,
            nodeData.nodeIP,
            nodeData.nodeUserName,
            nodeData.nodeArch,
            nodeData.nodeRole,
            orgs
        ];
        table.push(row);
    }

    console.log(table.toString());
    console.log("\n");
}