const fs = require('fs');
const execSync = require('child_process').execSync;
const execShellCommand = require('./execShellCommand')
const checkCertsValidity = require('./checkCertsValidity');
const checkIfSecretsAreCreated = require('./checkIfSecretsAreCreated');
const checkIfConfigsAreCreated = require('./checkIfConfigsAreCreated');
const secretsGenerator = require('./secretsGenerator');
const configGenerator = require('./configGenerator');
const stackFileGenerator = require('./stackFileGenerator');
var clc = require("cli-color");
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

module.exports = async (osi4iotState = null) => {
    if (!osi4iotState) {
        if (!fs.existsSync('./osi4iot_state.json')) {
            console.log(clc.red("The file osi4iot_state.json not exist. \nUse the command 'osi4iot init' to create it."));
            return;
        } else {
            const osi4iotStateText = fs.readFileSync('./osi4iot_state.json', 'UTF-8');
            osi4iotState = JSON.parse(osi4iotStateText);

            let osi4iotStateFileNeedToBeUpdated = false;
            let certsUpdateIsNeedeed = false;
            try {
                certsUpdateIsNeedeed = checkCertsValidity(osi4iotState);
            } catch (error) {
                console.log(clc.red(error));
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

    const networks = execSync("docker network ls");
    if (networks.indexOf("traefik_public") === -1) {
        execSync("docker network create -d overlay --opt encrypted=true traefik_public");
    }

    if (networks.indexOf("agent_network") === -1) {
        execSync("docker network create -d overlay --opt encrypted=true agent_network");
    }

    if (networks.indexOf("internal_net") === -1) {
        execSync("docker network create -d overlay --opt encrypted=true internal_net");
    }

    let index = 0
    process.stdout.write('\u001B[?25l');
    console.log("Deploying docker swarm stack:");
    execShellCommand("docker stack deploy --resolve-image changed -c osi4iot_stack.yml osi4iot")
        .then(() => {
            setInterval(function () {
                process.stdout.write(`\rWaiting until all services be ready ${dots[index]}`);
                index = index < (dots.length - 1) ? index + 1 : 0;
                let text = execSync("docker service ls");
                let continuar = text.indexOf(" 0/1 ") !== -1 ||
                    text.indexOf(" 0/3 ") !== -1 ||
                    text.indexOf(" 1/3 ") !== -1 ||
                    text.indexOf(" 2/3 ") !== -1;
                if (!continuar) {
                    console.log("\nRemoving unused containers and images.");
                    execSync("docker system prune --force");
                    console.log(clc.green("\nOsi4iot platform is ready to be used !!!"))
                    process.stdout.write('\u001B[?25h');
                    clearInterval(this);
                }
            }, 1000);
        })
        .catch((error) => {
            console.log(clc.red("Docker stack could not be deployed. Error: ", error));
        });

}
