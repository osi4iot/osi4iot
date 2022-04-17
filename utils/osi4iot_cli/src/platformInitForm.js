import fs from 'fs';
import validUrl from 'valid-url';
import timezoneValidator from 'timezone-validator';
import { nanoid } from 'nanoid';
import { execSync } from 'child_process';
import bcrypt from 'bcryptjs';
import clc from "cli-color";
import removeCerts from './removeCerts.js';
import certsGenerator from './certsGenerator.js';
import secretsGenerator from './secretsGenerator.js';
import configGenerator from './configGenerator.js';
import stackFileGenerator from './stackFileGenerator.js';
import runStack from './runStack.js';
import inquirer from './inquirer.js';
import findManagerDockerHost from './findManagerDockerHost.js';
import nodesConfiguration from './nodesConfiguration.js';


const platformInitiation = () => {
    inquirer
        .prompt([
            {
                name: 'PLATFORM_NAME',
                message: 'Platform name: ',
                default: 'IOT_PLATFORM',
                validate: function (platformName) {
                    if (platformName.length >= 4) {
                        return true;
                    } else {
                        return "Please type at least 4 characters";
                    }
                }
            },
            {
                name: 'DOMAIN_NAME',
                message: 'Domain name: '
            },
            {
                name: 'PLATFORM_PHRASE',
                message: 'Platform motivational phrase: ',
                default: 'Open source integration for internet of things'
            },
            {
                name: 'PLATFORM_ADMIN_FIRST_NAME',
                message: 'Platform admin first name: ',
                validate: function (platformName) {
                    if (platformName.length >= 2) {
                        return true;
                    } else {
                        return "Please type at least 2 characters";
                    }
                }
            },
            {
                name: 'PLATFORM_ADMIN_SURNAME',
                message: 'Platform admin last name: ',
                validate: function (platformName) {
                    if (platformName.length >= 2) {
                        return true;
                    } else {
                        return "Please type at least 2 characters";
                    }
                }
            },
            {
                name: 'PLATFORM_ADMIN_USER_NAME',
                message: 'Platform admin user name: ',
                validate: function (platformName) {
                    if (platformName.length >= 6) {
                        return true;
                    } else {
                        return "Please type at least 6 characters";
                    }
                }
            },
            {
                name: 'PLATFORM_ADMIN_EMAIL',
                message: 'Platform admin email: ',
                validate: function (email) {
                    const valid = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email)
                    if (valid) {
                        return true;
                    } else {
                        return "Please type a valid email";
                    }
                }
            },
            {
                name: 'PLATFORM_ADMIN_PASSWORD',
                message: 'Platform admin password: ',
                validate: function (password) {
                    const valid = /^[A-Za-z]\w{7,14}$/.test(password);
                    if (valid) {
                        return true;
                    } else {
                        return "Please type a password with 7 to 15 characters which contain only characters, numeric digits, underscore and first character must be a letter";
                    }
                }
            },
            {
                name: 'NUMBER_OF_SWARM_NODES',
                message: 'Number of nodes in the platform: ',
                default: 1,
                validate: function (numOfNodes) {
                    let valid = false;
                    if (numOfNodes !== "" && Number.isInteger(Number(numOfNodes)) && Number(numOfNodes) >= 1) valid = true;
                    if (valid) {
                        return true;
                    } else {
                        return "Please type an integer number greater or equal to one";
                    }
                }
            },
            {
                name: 'IS_LOCAL_INSTALLATION',
                message: 'Is a local installation: ',
                type: 'confirm',
                when: (answers) => answers.NUMBER_OF_SWARM_NODES === 1,
                validate: function (numOfNodes) {
                    let valid = false;
                    if (numOfNodes !== "" && Number.isInteger(Number(numOfNodes)) && Number(numOfNodes) >= 1) valid = true;
                    if (valid) {
                        return true;
                    } else {
                        return "Please type an integer number greater or equal to one";
                    }
                }
            }
        ])
        .then(async (prevAnswers) => {
            const numSwarmNodes = prevAnswers.NUMBER_OF_SWARM_NODES;
            const isLocalInstallation = prevAnswers.IS_LOCAL_INSTALLATION;
            const nodesData = []
            if (numSwarmNodes > 1 || !isLocalInstallation) {
                for (let inode = 1; inode <= numSwarmNodes; inode++) {
                    await swarmNodesQuestions(prevAnswers, inode).then(answers => {
                        nodesData.push(answers);
                    });
                }
            } else {
                nodesData.push({ nodeHostName: "localhost", nodeIP: "localhost", nodeUserName: "", nodeRole: "Manager" });
            }
            const newAnswers = { ...prevAnswers, NODES_DATA: nodesData };
            finalQuestions(newAnswers, numSwarmNodes);
        });

}

const swarmNodesQuestions = async (prevAnswers, inode) => {
    const defaultUserName = prevAnswers.PLATFORM_ADMIN_USER_NAME;
    const numSwarmNodes = prevAnswers.NUMBER_OF_SWARM_NODES;
    console.log(clc.whiteBright(`\nNode ${inode} data:`));
    return inquirer
        .prompt([
            {
                name: "nodeHostName",
                message: "Node hostname:",
                validate: function (nodeName) {
                    if (nodeName.length >= 5) {
                        return true;
                    } else {
                        return "Please type at least 5 characters";
                    }
                }
            },
            {
                name: "nodeIP",
                message: "Node IP address:",
                validate: function (nodeIP) {
                    const valid = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(nodeIP)
                    if (valid) {
                        return true;
                    } else {
                        return "Please type a valid IP address";
                    }
                }
            },
            {
                name: "nodeUserName",
                message: "Node user name:",
                default: defaultUserName,
                validate: function (nodeUserName) {
                    if (nodeUserName.length >= 5) {
                        return true;
                    } else {
                        return "Please type at least 5 characters";
                    }
                }
            },
            {
                name: "nodeRole",
                message: "Node role in the platform:",
                type: 'list',
                default: "Manager",
                choices: ["Manager", "Platform worker", "Generic org worker", "Exclusive org worker", "NFS server"],
                when: () => numSwarmNodes > 1
            },
        ])
        .then(answers => {
            const userName = answers.nodeUserName;
            const nodeIP = answers.nodeIP;
            if (numSwarmNodes === 1) answers.nodeRole = "Manager";
            //OJO execSync(`ssh-copy-id -i ./.osi4iot_keys/osi4iot_ed25519 ${userName}@${nodeIP}`, { stdio: 'ignore' })
            return answers;
        });
}

const removeNodeLabels = (dockerHost, nodeName, labelsArray) => {
    const labelString = execSync(`docker ${dockerHost} node inspect ${nodeName}`);
    for (let ilabel = 0; ilabel < labelsArray.length; ilabel++) {
        const label = labelsArray[ilabel];
        if (labelString.includes(label)) {
            execSync(`docker ${dockerHost} node update --label-rm ${label} ${nodeName}`);
        }
    }
}

const generateNodesLabelsAndRunStack = async (osi4iotState) => {
    const nodesData = osi4iotState.platformInfo.NODES_DATA;
    const dockerHost = findManagerDockerHost(nodesData);
    if (nodesData.length === 1) {
        await runStack(osi4iotState, dockerHost);
    } else {
        const prioritiesArray = [300, 200, 100];
        let priorityIndex = 0;
        for (let inode = 0; inode < nodesData.length; inode++) {
            const nodeRole = nodesData[inode].nodeRole;
            const nodeName = nodesData[inode].nodeHostName;
            if (nodeRole === "Manager") {
                const priority = prioritiesArray[priorityIndex];
                execSync(`docker ${dockerHost} node update --label-add KEEPALIVED_PRIORITY=${priority} ${nodeName}`);
                priorityIndex++;
                removeNodeLabels(dockerHost, nodeName, ["platform_worker", "generic_org_worker", "org_hash"]);
            } else if (nodeRole === "Platform worker") {
                execSync(`docker ${dockerHost} node update --label-add  platform_worker=true ${nodeName}`);
                removeNodeLabels(dockerHost, nodeName, ["KEEPALIVED_PRIORITY", "generic_org_worker", "org_hash"]);
            } else if (nodeRole === "Generic org worker") {
                execSync(`docker ${dockerHost} node update --label-add  generic_org_worker=true ${nodeName}`);
                removeNodeLabels(dockerHost, nodeName, ["KEEPALIVED_PRIORITY", "KEEPALIVED_PRIORITY", "org_hash"]);
            } else if (nodeRole === "Exclusive org worker") {
                const orgHash = osi4iotState.certs.mqtt_certs.organizations[0].org_hash;
                execSync(`docker ${dockerHost} node update --label-add org_hash=${orgHash} ${nodeName}`);
                removeNodeLabels(dockerHost, nodeName, ["platform_worker", "generic_org_worker", "KEEPALIVED_PRIORITY"]);
            }
        }
        await runStack(osi4iotState, dockerHost);
    }
}

const finalQuestions = (oldAnswers) => {
    const nodesData = oldAnswers.NODES_DATA;
    let managerNodes = [];
    const workerNodesRows = [];
    const orgWorkerSelection = [
        {
            name: "Select",
            value: "selected"
        }
    ];

    if (nodesData.length !== 0) {
        managerNodes = nodesData.filter(node => node.nodeRole === "Manager");
        const exclusiveOrgWorkerNodes = nodesData.filter(node => node.nodeRole === "Exclusive org worker");
        if (exclusiveOrgWorkerNodes.length !== 0) {
            for (let inode = 1; inode <= exclusiveOrgWorkerNodes.length; inode++) {
                const workerNodesRow = { name: exclusiveOrgWorkerNodes[inode - 1].nodeHostName, value: inode };
                workerNodesRows.push(workerNodesRow);
            }
        }
    }

    inquirer
        .prompt([
            {
                name: 'MIN_LONGITUDE',
                message: 'Min longitude of the geographical zone of the platform: ',
                default: -10.56884765625,
                validate: function (longitude) {
                    let valid = false;
                    if (longitude !== "" && typeof (parseFloat(longitude)) === 'number') {
                        if (longitude >= -180 && longitude <= 180) valid = true;
                    }
                    if (valid) {
                        return true;
                    } else {
                        return "Please type a valid longitude";
                    }
                }
            },
            {
                name: 'MAX_LONGITUDE',
                message: 'Max longitude of the geographical zone of the platform: ',
                default: 1.42822265625,
                validate: function (longitude) {
                    let valid = false;
                    if (longitude !== "" && typeof (parseFloat(longitude)) === 'number') {
                        if (longitude >= -180 && longitude <= 180) valid = true;
                    }
                    if (valid) {
                        return true;
                    } else {
                        return "Please type a valid longitude";
                    }
                }
            },
            {
                name: 'MIN_LATITUDE',
                message: 'Min latitude of the geographical zone of the platform: ',
                default: 35.55010533588552,
                validate: function (latitude) {
                    let valid = false;
                    if (latitude !== "" && typeof (parseFloat(latitude)) === 'number') {
                        if (latitude >= -90 && latitude <= 90) valid = true;
                    }
                    if (valid) {
                        return true;
                    } else {
                        return "Please type a valid latitude";
                    }
                }
            },
            {
                name: 'MAX_LATITUDE',
                message: 'Max latitude of the geographical zone of the platform: ',
                default: 44.134913443750726,
                validate: function (latitude) {
                    let valid = false;
                    if (latitude !== "" && typeof (parseFloat(latitude)) === 'number') {
                        if (latitude >= -90 && latitude <= 90) valid = true;
                    }
                    if (valid) {
                        return true;
                    } else {
                        return "Please type a valid latitude";
                    }
                }
            },
            {
                name: 'DEFAULT_TIME_ZONE',
                message: 'Default time zone: ',
                default: 'Europe/Madrid',
                validate: function (timezone) {
                    if (timezoneValidator(timezone)) {
                        return true;
                    } else {
                        return "Please tye a valid timezone";
                    }
                }
            },
            {
                name: 'MAIN_ORGANIZATION_NAME',
                message: 'Main organization name: ',
                default: 'My main org',
                validate: function (text) {
                    if (text.length >= 4) {
                        return true;
                    } else {
                        return "Please type at least 4 characters";
                    }
                }
            },
            {
                name: 'MAIN_ORGANIZATION_ACRONYM',
                message: 'Main organization acronym: ',
                default: 'MYORG',
                validate: function (text) {
                    if (text.length >= 3) {
                        return true;
                    } else {
                        return "Please type at least 3 characters";
                    }
                }
            },
            {
                name: 'MAIN_ORGANIZATION_ADDRESS1',
                message: 'Main organization address: ',
                validate: function (text) {
                    if (text.length >= 4) {
                        return true;
                    } else {
                        return "Please type at least a valid address";
                    }
                }
            },
            {
                name: 'MAIN_ORGANIZATION_CITY',
                message: 'Main organization city: ',
                validate: function (text) {
                    if (text.length >= 4) {
                        return true;
                    } else {
                        return "Please type at least a valid city";
                    }
                }
            },
            {
                name: 'MAIN_ORGANIZATION_ZIP_CODE',
                message: 'Main organization zip code: ',
                validate: function (text) {
                    if (text.length >= 5) {
                        return true;
                    } else {
                        return "Please type at least a valid zip code";
                    }
                }
            },
            {
                name: 'MAIN_ORGANIZATION_STATE',
                message: 'Main organization state/province: ',
                validate: function (text) {
                    if (text.length >= 4) {
                        return true;
                    } else {
                        return "Please type at least a valid state/province";
                    }
                }
            },
            {
                name: 'MAIN_ORGANIZATION_COUNTRY',
                message: 'Main organization country: ',
                validate: function (text) {
                    if (text.length >= 4) {
                        return true;
                    } else {
                        return "Please type at least a valid country";
                    }
                }
            },
            {
                name: 'MAIN_ORGANIZATION_TELEGRAM_BOTTOKEN',
                message: 'Telegram boottoken for main organization default group: ',
                validate: function (text) {
                    if (text.length >= 20) {
                        return true;
                    } else {
                        return "Please type at least a telegram boottoken";
                    }
                }
            },
            {
                name: 'MAIN_ORGANIZATION_TELEGRAM_CHAT_ID',
                message: 'Telegram chat id for main organization default group: ',
                validate: function (telegramChatId) {
                    let valid = false;
                    if (telegramChatId !== "" && Number.isInteger(Number(telegramChatId))) valid = true;
                    if (valid) {
                        return true;
                    } else {
                        return "Please type an integer number";
                    }
                }
            },
            {
                name: 'MAIN_ORGANIZATION_TELEGRAM_INVITATION_LINK',
                message: 'Telegram invitation link for main organization default group: ',
                validate: function (url) {
                    if (validUrl.isUri(url)) {
                        return true;
                    } else {
                        return "Please type a valid url";
                    }
                }
            },
            {
                name: 'ARE_MAIN_ORG_SERVICES_DEPLOYED_IN_EXCLUSIVE_NODES',
                message: 'Main organization services will be deployed in exclusive org worker nodes',
                type: "confirm",
                when: () => workerNodesRows.length !== 0
            },
            {
                name: 'MAIN_ORGANIZATION_EXCLUSIVE_WORKER_NODES',
                type: "table",
                message: "Choose the worker nodes for the main organization",
                pageSize: workerNodesRows.length,
                columns: orgWorkerSelection,
                rows: workerNodesRows,
                when: (answers) => workerNodesRows.length !== 0 && answers.ARE_MAIN_ORG_SERVICES_DEPLOYED_IN_EXCLUSIVE_NODES
            },
            {
                name: 'NUMBER_OF_MASTER_DEVICES_IN_MAIN_ORG',
                message: 'Number of master devices in main org: ',
                default: 3,
                validate: function (numOfMD) {
                    let valid = false;
                    if (numOfMD !== "" && Number.isInteger(Number(numOfMD)) && Number(numOfMD) >= 1) valid = true;
                    if (valid) {
                        return true;
                    } else {
                        return "Please type an integer number greater or equal to one";
                    }
                }
            },            
            {
                name: 'NOTIFICATIONS_EMAIL_ADDRESS',
                message: 'Email account for platform notifications: ',
                validate: function (email) {
                    const valid = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email)
                    if (valid) {
                        return true;
                    } else {
                        return "Please type a valid email";
                    }
                }
            },
            {
                name: 'NOTIFICATIONS_EMAIL_PASSWORD',
                message: 'Email account password: ',
                validate: function (password) {
                    let valid = /^[A-Za-z]\w{7,30}$/.test(password);
                    if (valid) {
                        return true;
                    } else {
                        return "Please type a password with 7 to 30 characters which contain only characters, numeric digits, underscore and first character must be a letter";
                    }
                }
            },
            {
                name: 'DOMAIN_SSL_PRIVATE_KEY',
                message: 'Domain SSL private key: ',
                type: 'editor'
            },
            {
                name: 'DOMAIN_SSL_CA_CERT',
                message: 'Domain SSL CA certificates only as intermediate(s)/root only, PEM encoded: ',
                type: 'editor'
            },
            {
                name: 'DOMAIN_SSL_CERTICATE',
                message: 'Domain SSL certificate only, PEM encoded: ',
                type: 'editor'
            },
            {
                name: 'REGISTRATION_TOKEN_LIFETIME',
                message: 'Registration token lifetime in seconds: ',
                default: 86400,
                validate: function (tokenLifeTime) {
                    let valid = false;
                    if (tokenLifeTime !== "" && Number(tokenLifeTime) >= 3600) valid = true;
                    if (valid) {
                        return true;
                    } else {
                        return "Please type an integer number greater or equal to 3600";
                    }
                }
            },
            {
                name: 'ACCESS_TOKEN_LIFETIME',
                message: 'Access token lifetime in seconds: ',
                default: 86400,
                validate: function (tokenLifeTime) {
                    let valid = false;
                    if (tokenLifeTime !== "" && Number(tokenLifeTime) >= 3600) valid = true;
                    if (valid) {
                        return true;
                    } else {
                        return "Please type an integer number greater or equal to 3600";
                    }
                }
            },
            {
                name: 'REFRESH_TOKEN_LIFETIME',
                message: 'Refresh token lifetime in seconds: ',
                default: 31536000,
                validate: function (tokenLifeTime) {
                    let valid = false;
                    if (tokenLifeTime !== "" && Number(tokenLifeTime) >= 86400) valid = true;
                    if (valid) {
                        return true;
                    } else {
                        return "Please type an integer number greater or equal to 86400";
                    }
                }
            },
            {
                name: 'MQTT_SSL_CERTS_VALIDITY_DAYS',
                message: 'Mqtt ssl certs validity days: ',
                default: 365,
                validate: function (validityDays) {
                    let valid = false;
                    if (validityDays !== "" && Number(validityDays) >= 30) valid = true;
                    if (valid) {
                        return true;
                    } else {
                        return "Please type an integer number greater or equal to 30";
                    }
                }
            },
            {
                name: 'FLOATING_IP_ADDRES',
                message: 'Floating IP address: ',
                when: () => managerNodes.length > 1,
                validate: function (ipAddress) {
                    const valid = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ipAddress)
                    if (valid) {
                        return true;
                    } else {
                        return "Please type a valid IP address";
                    }
                }
            },
            {
                name: 'NETWORK_INTERFACE',
                message: 'Manager nodes network interface: ',
                default: 'eth0',
                when: () => managerNodes.length > 1,
                validate: function (networkInterface) {
                    if (networkInterface.length >= 4) {
                        return true;
                    } else {
                        return "Please type at least 4 characters";
                    }
                }
            }
        ])
        .then((newAnswers) => {
            const answers = { ...oldAnswers, ...newAnswers };
            console.log("");
            inquirer
                .prompt([
                    {
                        type: 'confirm',
                        name: 'confirmation',
                        message: 'Confirm that all the above answers are correct ',
                    },
                ])
                .then(async (confirmationAnswer) => {
                    if (!confirmationAnswer.confirmation) {
                        console.log("");
                        platformInitiation();
                    } else {
                        const mainOrgExclusiveWorkerNodes = [];
                        for (let inode = 0; inode < workerNodesRows.length; inode++) {
                            if (answers.MAIN_ORGANIZATION_EXCLUSIVE_WORKER_NODES[inode] === "selected") {
                                mainOrgExclusiveWorkerNodes.push(workerNodesRows[inode].name)
                            }
                        }

                        const osi4iotState = {
                            platformInfo: {
                                PLATFORM_NAME: answers.PLATFORM_NAME,
                                DOMAIN_NAME: answers.DOMAIN_NAME,
                                PLATFORM_PHRASE: answers.PLATFORM_PHRASE,
                                PLATFORM_ADMIN_FIRST_NAME: answers.PLATFORM_ADMIN_FIRST_NAME,
                                PLATFORM_ADMIN_SURNAME: answers.PLATFORM_ADMIN_SURNAME,
                                PLATFORM_ADMIN_USER_NAME: answers.PLATFORM_ADMIN_USER_NAME,
                                PLATFORM_ADMIN_EMAIL: answers.PLATFORM_ADMIN_EMAIL,
                                PLATFORM_ADMIN_PASSWORD: answers.PLATFORM_ADMIN_PASSWORD,
                                NODES_DATA: answers.NODES_DATA,
                                MIN_LONGITUDE: answers.MIN_LONGITUDE,
                                MAX_LONGITUDE: answers.MAX_LONGITUDE,
                                MIN_LATITUDE: answers.MIN_LATITUDE,
                                MAX_LATITUDE: answers.MAX_LATITUDE,
                                DEFAULT_TIME_ZONE: answers.DEFAULT_TIME_ZONE,
                                MAIN_ORGANIZATION_NAME: answers.MAIN_ORGANIZATION_NAME,
                                MAIN_ORGANIZATION_ACRONYM: answers.MAIN_ORGANIZATION_ACRONYM,
                                MAIN_ORGANIZATION_ADDRESS1: answers.MAIN_ORGANIZATION_ADDRESS1,
                                MAIN_ORGANIZATION_CITY: answers.MAIN_ORGANIZATION_CITY,
                                MAIN_ORGANIZATION_ZIP_CODE: answers.MAIN_ORGANIZATION_ZIP_CODE,
                                MAIN_ORGANIZATION_STATE: answers.MAIN_ORGANIZATION_STATE,
                                MAIN_ORGANIZATION_COUNTRY: answers.MAIN_ORGANIZATION_COUNTRY,
                                MAIN_ORGANIZATION_TELEGRAM_BOTTOKEN: answers.MAIN_ORGANIZATION_TELEGRAM_BOTTOKEN,
                                MAIN_ORGANIZATION_TELEGRAM_CHAT_ID: answers.MAIN_ORGANIZATION_TELEGRAM_CHAT_ID,
                                MAIN_ORGANIZATION_TELEGRAM_INVITATION_LINK: answers.MAIN_ORGANIZATION_TELEGRAM_INVITATION_LINK,
                                MAIN_ORGANIZATION_EXCLUSIVE_WORKER_NODES: mainOrgExclusiveWorkerNodes,
                                NUMBER_OF_MASTER_DEVICES_IN_MAIN_ORG: parseInt(answers.NUMBER_OF_MASTER_DEVICES_IN_MAIN_ORG, 10),
                                NOTIFICATIONS_EMAIL_USER: answers.NOTIFICATIONS_EMAIL_ADDRESS,
                                NOTIFICATIONS_EMAIL_ADDRESS: answers.NOTIFICATIONS_EMAIL_ADDRESS,
                                NOTIFICATIONS_EMAIL_PASSWORD: answers.NOTIFICATIONS_EMAIL_PASSWORD,
                                REGISTRATION_TOKEN_LIFETIME: answers.REGISTRATION_TOKEN_LIFETIME,
                                REFRESH_TOKEN_LIFETIME: answers.REFRESH_TOKEN_LIFETIME,
                                REFRESH_TOKEN_SECRET: nanoid(20).replace(/-/g, "x").replace(/_/g, "X"),
                                ACCESS_TOKEN_SECRET: nanoid(20).replace(/-/g, "x").replace(/_/g, "X"),
                                ACCESS_TOKEN_LIFETIME: answers.ACCESS_TOKEN_LIFETIME,
                                MQTT_SSL_CERTS_VALIDITY_DAYS: parseInt(answers.MQTT_SSL_CERTS_VALIDITY_DAYS, 10),
                                FLOATING_IP_ADDRES: answers.FLOATING_IP_ADDRES || '127.0.0.1',
                                NETWORK_INTERFACE: answers.NETWORK_INTERFACE || 'eth0',
                                ENCRYPTION_SECRET_KEY: nanoid(32).replace(/-/g, "x").replace(/_/g, "X"),
                                GRAFANA_ADMIN_PASSWORD: answers.PLATFORM_ADMIN_PASSWORD,
                                POSTGRES_USER: answers.PLATFORM_ADMIN_USER_NAME,
                                POSTGRES_PASSWORD: answers.PLATFORM_ADMIN_PASSWORD,
                                POSTGRES_DB: "iot_platform_db",
                                GRAFANA_DB_PASSWORD: nanoid(20).replace(/-/g, "x").replace(/_/g, "X"),
                                GRAFANA_DATASOURCE_PASSWORD: nanoid(20).replace(/-/g, "x").replace(/_/g, "X"),
                                NODE_RED_ADMIN: answers.PLATFORM_ADMIN_USER_NAME,
                                NODE_RED_ADMIN_HASH: bcrypt.hashSync(answers.PLATFORM_ADMIN_PASSWORD, 8),
                                PGADMIN_DEFAULT_EMAIL: answers.PLATFORM_ADMIN_EMAIL,
                                PGADMIN_DEFAULT_PASSWORD: answers.PLATFORM_ADMIN_PASSWORD,
                                NFS_SERVER_IP: answers.NFS_SERVER_IP || '127.0.0.1',
                                IS_NODERED_VOLUME_ALREADY_CREATED: 'false',
                                NODES_DATA: answers.NODES_DATA
                            },
                            certs: {
                                domain_certs: {
                                    private_key: answers.DOMAIN_SSL_PRIVATE_KEY,
                                    iot_platform_key_name: "",
                                    ssl_ca_pem: answers.DOMAIN_SSL_CA_CERT,
                                    iot_platform_ca_name: "",
                                    ssl_cert_crt: answers.DOMAIN_SSL_CERTICATE,
                                    iot_platform_cert_name: "",
                                    ca_pem_expiration_timestamp: 0,
                                    cert_crt_expiration_timestamp: 0
                                },
                                mqtt_certs: {
                                    ca_certs: {
                                        ca_crt: "",
                                        mqtt_certs_ca_cert_name: "",
                                        ca_key: "",
                                        mqtt_certs_ca_key_name: "",
                                        expiration_timestamp: 0
                                    },
                                    broker: {
                                        server_crt: "",
                                        mqtt_broker_cert_name: "",
                                        server_key: "",
                                        mqtt_broker_key_name: "",
                                        expiration_timestamp: 0
                                    },
                                    nodered: {
                                        client_crt: "",
                                        mqtt_nodered_client_cert_name: "",
                                        client_key: "",
                                        mqtt_nodered_client_key_name: "",
                                        expiration_timestamp: 0
                                    },
                                    organizations: []
                                }
                            }
                        }

                        osi4iotState.certs.mqtt_certs.organizations[0] = {
                            org_hash: nanoid(16).replace(/-/g, "x").replace(/_/g, "X"),
                            master_devices: []
                        }
                        for (let idev = 1; idev <= answers.NUMBER_OF_MASTER_DEVICES_IN_MAIN_ORG; idev++) {
                            osi4iotState.certs.mqtt_certs.organizations[0].master_devices[idev - 1] = {
                                client_crt: "",
                                client_key: "",
                                expiration_timestamp: 0,
                                md_hash: nanoid(16).replace(/-/g, "x").replace(/_/g, "X"),
                                is_volume_created: 'false'
                            }
                            osi4iotState.certs.mqtt_certs.organizations[0].master_devices[idev - 1].client_crt_name = "";
                            osi4iotState.certs.mqtt_certs.organizations[0].master_devices[idev - 1].client_key_name = "";
                        }

                        try {
                            console.log(clc.green('\nConfigurating nodes in the cluster...'));
                            await nodesConfiguration(osi4iotState);
    
                            console.log(clc.green('\nJoining nodes to swarm:'));
                            joinNodesToSwarm(answers.NODES_DATA);
    
                            console.log(clc.green('\nCreating certificates...'));
                            removeCerts(osi4iotState);
                            await certsGenerator(osi4iotState);
                            const osi4iotStateFile = JSON.stringify(osi4iotState);
                            fs.writeFileSync('./osi4iot_state.json', osi4iotStateFile);
    
                            console.log(clc.green('Creating secrets...'))
                            secretsGenerator(osi4iotState);
                            console.log(clc.green('Creating configs...'))
                            configGenerator(osi4iotState);
                            console.log(clc.green('Creating stack file...\n'))
                            stackFileGenerator(osi4iotState);
    
                            await generateNodesLabelsAndRunStack(osi4iotState);
                        } catch (error) {
                            console.log(clc.redBright(error));
                        }
                    }
                });

        })
        .catch((error) => {
            if (error.isTtyError) {
                console.log("Prompt couldn't be rendered in the current environment")
            } else {
                console.log("Error in osi4iot cli: ", error)
            }
        })
}

export default async function () {
    if (fs.existsSync('./osi4iot_state.json')) {
        inquirer
            .prompt([{
                name: 'confirm_platform_initiation',
                type: 'confirm',
                message: 'An state file already exits. Do you want to reinitate the platform anyway? ',
            }
            ])
            .then((answers) => {
                if (answers.confirm_platform_initiation) platformInitiation();
            })
            .catch((error) => {
                if (error.isTtyError) {
                    console.log("Prompt couldn't be rendered in the current environment")
                } else {
                    console.log("Error in osi4iot cli: ", error)
                }
            });
    } else {
        platformInitiation();
    }
}

const joinNodesToSwarm = (nodesData) => {
    const numNodes = nodesData.length;
    let outputResult = "OK";
    if (numNodes === 1) {
        const userName = nodesData[0].nodeUserName;
        const nodeIP = nodesData[0].nodeIP;
        const nodeHostName = nodesData[0].nodeHostName;
        if (nodeIP === "localhost") {
            try {
                execSync("docker swarm leave --force", { stdio: 'ignore' });
            } catch (error) {
                //do nothing
            }
            try {
                console.log(clc.green('Joining localhost to swarm...'));
                execSync("docker swarm init", { stdio: 'ignore' });
            } catch (err) {
                console.log(clc.redBright('Error joining localhost to swarm.'));
                outputResult = "Failed";
            }
        } else {
            try {
                execSync(`docker -H ssh://${userName}@${nodeIP} swarm leave --force`, { stdio: 'ignore' });
            } catch (error) {
                //do nothing
            }
            try {
                console.log(clc.green(`Joining node ${nodeHostName} to swarm...`));
                execSync(`docker -H ssh://${userName}@${nodeIP} swarm init`, { stdio: 'ignore' });
            } catch (err) {
                console.log(clc.redBright(`Error joining ${nodeHostName} node to swarm.`));
                outputResult = "Failed";
            }
        }
    } else {
        let joinWorkerCommand = "";
        let joinManagerCommand = "";
        let isMainManagerJoined = false;
        for (let inode = 1; inode <= nodesData; inode++) {
            const userName = nodesData[inode - 1].nodeUserName;
            const nodeIP = nodesData[inode - 1].nodeIP;
            const nodeRole = nodesData[inode - 1].nodeRole;
            const nodeHostName = nodesData[inode - 1].nodeHostName;
            try {
                execSync(`docker -H ssh://${userName}@${nodeIP} swarm leave --force`, { stdio: 'ignore' });
            } catch (error) {
                //do nothing
            }
            try {
                if (nodeRole === "Manager") {
                    if (!isMainManagerJoined) {
                        console.log(clc.green(`Joining node ${nodeHostName} to swarm ...`));
                        joinWorkerCommand = execSync(`docker -H ssh://${userName}@${nodeIP} swarm init`)
                            .toString()
                            .split("\n")[4]
                            .trim();
                        joinManagerCommand = execSync(`docker -H ssh://${userName}@${nodeIP} swarm join-token manager`)
                            .toString()
                            .split("\n")[2]
                            .trim();
                        isMainManagerJoined = true;
                    } else {
                        console.log(clc.green(`Joining node ${nodeHostName} to swarm ...`));
                        execSync(joinManagerCommand, { stdio: 'ignore' })
                    }
                } else if (nodeRole === "Platform worker" || nodeRole === "Generic org worker" || nodeRole === "Exclusive org worker") {
                    console.log(clc.green(`Joining node ${nodeHostName} to swarm ...`));
                    execSync(joinWorkerCommand, { stdio: 'ignore' });
                }
            } catch (err) {
                console.log(clc.redBright(`Error joining ${nodeHostName} node to swarm.`));
                outputResult = "Failed";
            }
        }
    }

    if (outputResult === "Failed") {
        throw new Error("Error joining nodes to swarm");
    }
}