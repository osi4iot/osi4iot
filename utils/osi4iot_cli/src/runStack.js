import fs from 'fs';
import clc from 'cli-color';
import { execSync } from 'child_process';
import execShellCommand from './execShellCommand.js';
import checkCertsValidity from './checkCertsValidity.js';
import checkIfSecretsAreCreated from './checkIfSecretsAreCreated.js';
import checkIfConfigsAreCreated from './checkIfConfigsAreCreated.js';
import secretsGenerator from './secretsGenerator.js';
import configGenerator from './configGenerator.js';
import stackFileGenerator from './stackFileGenerator.js';
import checkIfAllNoderedVolumesAreCreated from './checkIfAllNoderedVolumesAreCreated.js';
import markAsCreatedAllNoderedVolumes from './markAsCreatedAllNoderedVolumes.js';
import certsGenerator from './certsGenerator.js';

const dots = [
    "       ",
    ".      ",
    "..     ",
    "...    ",
    "....   ",
    ".....  ",
    "...... ",
    ".......",
];

export default async function (osi4iotState = null, dockerHost = null) {
    if (!dockerHost) {
        dockerHost = findManagerDockerHost(osi4iotState.platformInfo.NODES_DATA);
    }
    if (!osi4iotState) {
        if (!fs.existsSync('./osi4iot_state.json')) {
            console.log(clc.redBright("The file osi4iot_state.json not exist. \nUse the command 'osi4iot init' to create it."));
            return;
        } else {
            const osi4iotStateText = fs.readFileSync('./osi4iot_state.json', 'UTF-8');
            osi4iotState = JSON.parse(osi4iotStateText);

            let osi4iotStateFileNeedToBeUpdated = false;
            let certsUpdateIsNeedeed = false;
            try {
                certsUpdateIsNeedeed = checkCertsValidity(osi4iotState);
            } catch (error) {
                console.log(clc.redBright(error));
                return;
            }

            if (certsUpdateIsNeedeed) {
                console.log(clc.green('\nUpdating certificates...'))
                await certsGenerator(osi4iotState);
                osi4iotStateFileNeedToBeUpdated = true;
            }

            const areSecretsCreated = checkIfSecretsAreCreated();
            if (!areSecretsCreated) {
                console.log(clc.green('Creating secrets...'))
                secretsGenerator(osi4iotState);
                osi4iotStateFileNeedToBeUpdated = true;
            }

            const areConfigsCreated = checkIfConfigsAreCreated();
            if (!areConfigsCreated) {
                console.log(clc.green('Creating configs...'))
                configGenerator(osi4iotState);
                osi4iotStateFileNeedToBeUpdated = true;
            }

            console.log(clc.green('Creating stack file...\n'))
            stackFileGenerator(osi4iotState);

            if (osi4iotStateFileNeedToBeUpdated) {
                const osi4iotStateFile = JSON.stringify(osi4iotState);
                fs.writeFileSync('./osi4iot_state.json', osi4iotStateFile);
            }

        }
    }

    const networks = execSync(`docker ${dockerHost} network ls`);
    if (networks.indexOf("traefik_public") === -1) {
        execSync(`docker ${dockerHost} network create -d overlay --opt encrypted=true traefik_public`);
    }

    if (networks.indexOf("agent_network") === -1) {
        execSync(`docker ${dockerHost} network create -d overlay --opt encrypted=true agent_network`);
    }

    if (networks.indexOf("internal_net") === -1) {
        execSync(`docker ${dockerHost} network create -d overlay --opt encrypted=true internal_net`);
    }

    process.stdout.write('\u001B[?25l');
    console.log(clc.green("Deploying docker swarm stack:"));
    execShellCommand(`docker ${dockerHost} stack deploy --resolve-image changed --prune -c osi4iot_stack.yml osi4iot`)
        .then(() => {
            return new Promise(function (resolve, reject) {
                let index = 0
                setInterval(function () {
                    process.stdout.write(`\rWaiting until all services be ready ${dots[index]}`);
                    index = index < (dots.length - 1) ? index + 1 : 0;
                    let text;
                    try {
                        text = execSync(`docker ${dockerHost} service ls`);
                    } catch (err) {
                        reject("Error listing docker services.")
                    }
                    let continuar = text.indexOf(" 0/1 ") !== -1 ||
                        text.indexOf(" 0/3 ") !== -1 ||
                        text.indexOf(" 1/3 ") !== -1 ||
                        text.indexOf(" 2/3 ") !== -1;
                    if (!continuar) {
                        clearInterval(this);
                        if (!checkIfAllNoderedVolumesAreCreated(osi4iotState)) {
                            markAsCreatedAllNoderedVolumes(osi4iotState);
                            const osi4iotStateFile = JSON.stringify(osi4iotState);
                            fs.writeFileSync('./osi4iot_state.json', osi4iotStateFile);
                            stackFileGenerator(osi4iotState);
                            resolve("Redeploy stack")
                        } else {
                            console.log("\nRemoving unused containers and images.");
                            execSync("docker system prune --force");
                            console.log(clc.greenBright("\nOSI4IOT platform is ready to be used !!!\n"));
                            process.stdout.write('\u001B[?25h');
                            resolve("Finish");
                        }
                    }
                }, 1000);
            })
        })
        .then((command) => {
            if (command === "Redeploy stack") {
                console.log(clc.green("\n\nRedeploy stack for early created volumes"));
                execShellCommand(`docker ${dockerHost} stack deploy --resolve-image changed --prune -c osi4iot_stack.yml osi4iot`)
                    .then((exitCode) => {
                        if (exitCode === 0) {
                            let index = 0;
                            let timeCounter = 0;
                            setInterval(function () {
                                process.stdout.write(`\rWaiting to nodered and master_devices services be ready ${dots[index]}`);
                                index = index < (dots.length - 1) ? index + 1 : 0;
                                if (timeCounter >= 30) {
                                    let text = execSync(`docker ${dockerHost} service ls`).toString();
                                    let continuar = text.indexOf(" 0/1 ") !== -1 ||
                                        text.indexOf(" 0/3 ") !== -1 ||
                                        text.indexOf(" 1/3 ") !== -1 ||
                                        text.indexOf(" 2/3 ") !== -1;
                                    if (!continuar) {
                                        console.log("\nRemoving unused containers and images.");
                                        execSync("docker system prune --force");
                                        console.log(clc.greenBright("\nOSI4IOT platform is ready to be used !!!\n"))
                                        process.stdout.write('\u001B[?25h');
                                        clearInterval(this);
                                    }
                                } else timeCounter++;
                            }, 1000);
                        }
                    })
            }
        })
        .catch((error) => {
            const errorMessage = `Docker stack could not be deployed. Error: ${error}`;
            throw new Error(errorMessage);
        })
}
