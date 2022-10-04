import needle from 'needle';
import fs from 'fs';
import clc from "cli-color";
import { chooseOption } from '../menu/chooseOption.js';
import login from '../menu/login.js';
import certsGenerator from '../config_tools/certsGenerator.js';
import findManagerDockerHost from '../menu/findManagerDockerHost.js';
import runStack from '../menu/runStack.js';

export default async function () {
    if (!fs.existsSync('./osi4iot_state.json')) {
        console.log(clc.redBright("The file osi4iot_state.json not exist. \nUse the command 'osi4iot init' to create it."));
        return;
    } else {
        const osi4iotStateText = fs.readFileSync('./osi4iot_state.json', 'UTF-8');
        const osi4iotState = JSON.parse(osi4iotStateText);
        const accessToken = await login(osi4iotState);
        if (accessToken && accessToken !== "Login error") {
            const domainName = osi4iotState.platformInfo.DOMAIN_NAME;
            let protocol = "https";
            if (osi4iotState.platformInfo.DOMAIN_CERTS_TYPE === "No certs") {
                protocol = "http";
            }
            const optionsToken = {
                headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json", "Accept": "application/json" },
                rejectUnauthorized: false
            };

            const urlGetNodeRedInstances = `${protocol}://${domainName}/admin_api/nodered_instances`;
            const nodeRedInstances = await needle('get', urlGetNodeRedInstances, optionsToken)
                .then(res => res.body)
                .catch(err => console.log("Error getting node-red instances: %s", err.message));

            const nriMarkedAsDeleted = nodeRedInstances.filter(nri => nri.deleted === true);
            if (nriMarkedAsDeleted.length !== 0) {
                const response = await recoverNriMarkedAsDeleted(osi4iotState, nriMarkedAsDeleted, protocol, domainName, optionsToken);
                if (response) {
                    if (response.message === "NodeRed instance updated successfully") {
                        console.log(clc.greenBright("\nNodeRed instances recovered successfully\n"));
            
                        console.log(clc.green('\nCreating certificates...'));
                        await certsGenerator(osi4iotState);
                        const osi4iotStateFile = JSON.stringify(osi4iotState);
                        fs.writeFileSync('./osi4iot_state.json', osi4iotStateFile);
            
                        const nodesData = osi4iotState.platformInfo.NODES_DATA;
                        const dockerHost = findManagerDockerHost(nodesData);
                        await runStack(osi4iotState, dockerHost);
                    } else {
                        console.log(clc.redBright(`\nError: ${response.message}\n`));
                        chooseOption();
                    }
                }
            } else {
                console.log("\n");
                chooseOption();
            }

        } else {
            console.log("\n");
            chooseOption();
        }
    }
}

export const recoverNriMarkedAsDeleted = async (osi4iotState, nriMarkedAsDeleted, protocol, domainName, optionsToken) => {
    const currentOrgs = osi4iotState.certs.mqtt_certs.organizations;
    const nriHashArray = nriMarkedAsDeleted.map(nri => nri.nriHash);
    const nriIdArray = nriMarkedAsDeleted.map(nri => nri.id);
    const recoverNodeRedInstances = { nriIdArray }
    for (let iOrg = 0; iOrg < currentOrgs.length; iOrg++) {
        const nriArrayInOrg = currentOrgs[iOrg].nodered_instances;
        for (let inri = 0; inri < nriArrayInOrg.length; inri++) {
            const nriIndex = nriHashArray.indexOf(nriArrayInOrg[inri].nri_hash);
            if (nriIndex !== -1) {
                nriArrayInOrg[inri] = {
                    client_crt: "",
                    client_key: "",
                    expiration_timestamp: 0,
                    nri_hash: nriArrayInOrg[inri].nri_hash,
                    is_volume_created: 'false'
                }
            }
        }
        osi4iotState.certs.mqtt_certs.organizations[iOrg].nodered_instances = nriArrayInOrg;
    }

    const urlRecoverNodeRedInstances = `${protocol}://${domainName}/admin_api/nodered_instance/recover_instances`;
    const response = await needle('patch', urlRecoverNodeRedInstances, recoverNodeRedInstances, optionsToken)
        .then(res => res.body)
        .catch(err => console.log("Error recovering node-red instances marked as deleted: %s", err.message));
    
    return response;
}
