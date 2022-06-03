import fs from 'fs';
import clc from "cli-color";
import inquirer from 'inquirer';
import { chooseOption } from './chooseOption.js';
import certsGenerator from '../config_tools/certsGenerator.js';
import stackFileGenerator from '../config_tools/stackFileGenerator.js';
import runStack from './runStack.js';
import findManagerDockerHost from './findManagerDockerHost.js';
import clearScreen from './clearScreen.js';

export default async function () {
    if (!fs.existsSync('./osi4iot_state.json')) {
        console.log(clc.redBright("The file osi4iot_state.json not exist. \nUse the command 'osi4iot init' to create it."));
        return;
    } else {
        const osi4iotStateText = fs.readFileSync('./osi4iot_state.json', 'UTF-8');
        const osi4iotState = JSON.parse(osi4iotStateText);
        const nodesData = osi4iotState.platformInfo.NODES_DATA;
        if (nodesData && nodesData.length) {
            const dockerHost = findManagerDockerHost(nodesData);

            if (osi4iotState.platformInfo.DOMAIN_CERTS_TYPE === "Let's encrypt certs") {
                console.log(clc.green("\nLet's encrypt certs are updated automatically\n"))
                chooseOption();
            } else if ("Certs provided by an CA") {
                inquirer
                    .prompt([
                        {
                            name: 'DOMAIN_SSL_PRIVATE_KEY',
                            message: 'Domain SSL private key:',
                            type: 'editor',
                        },
                        {
                            name: 'DOMAIN_SSL_CA_CERT',
                            message: 'Domain SSL CA certificates only as intermediate(s)/root only, PEM encoded:',
                            type: 'editor',
                        },
                        {
                            name: 'DOMAIN_SSL_CERTICATE',
                            message: 'Domain SSL certificate only, PEM encoded:',
                            type: 'editor',
                        },
                    ])
                    .then(async (answers) => {
                        osi4iotState.certs.domain_certs.private_key = answers.DOMAIN_SSL_PRIVATE_KEY;
                        osi4iotState.certs.domain_certs.ssl_ca_pem = answers.DOMAIN_SSL_CA_CERT;
                        osi4iotState.certs.domain_certs.ssl_cert_crt = answers.DOMAIN_SSL_CERTICATE;

                        console.log(clc.green('\nUpdating certificates...'));
                        await certsGenerator(osi4iotState);
                        const osi4iotStateFile = JSON.stringify(osi4iotState);
                        fs.writeFileSync('./osi4iot_state.json', osi4iotStateFile);

                        console.log(clc.green('Creating stack file...\n'))
                        stackFileGenerator(osi4iotState);

                        await runStack(osi4iotState, dockerHost);
                    });
            }
        } else {
            clearScreen();
        }

    }
}