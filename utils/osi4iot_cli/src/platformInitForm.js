const fs = require('fs');
const inquirer = require('inquirer');
const validUrl = require('valid-url');
const timezoneValidator = require('timezone-validator');
const { nanoid } = require('nanoid');
const execSync = require('child_process').execSync;
const bcrypt = require('bcryptjs');
var clc = require("cli-color");
const removeCerts = require('./removeCerts');
const certsGenerator = require('./certsGenerator');
const secretsGenerator = require('./secretsGenerator');
const configGenerator = require('./configGenerator');
const stackFileGenerator = require('./stackFileGenerator');
const runStack = require('./runStack');

const platformInitiation = () => {
    const numSwarmNodes = execSync("docker node ls").toString().split('\n').length - 2;

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
                    valid = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email)
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
                    let valid = /^[A-Za-z]\w{7,14}$/.test(password);
                    if (valid) {
                        return true;
                    } else {
                        return "Please type a password with 7 to 15 characters which contain only characters, numeric digits, underscore and first character must be a letter";
                    }
                }
            },
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
                name: 'MAX_NUMBER_ORGS_EXPECTED',
                message: 'Maximum number of organizations expected: ',
                default: 2,
                validate: function (maxNumOrgs) {
                    let valid = false;
                    if (maxNumOrgs !== "" && Number.isInteger(Number(maxNumOrgs))) valid = true;
                    if (valid) {
                        return true;
                    } else {
                        return "Please type an integer number";
                    }
                }
            },
            {
                name: 'DEFAULT_MAX_NUMBER_MASTER_DEVICES_PER_ORG',
                message: 'Default maximum number of master devices per organization: ',
                default: 3,
                validate: function (maxNumMasterDevicePerOrg) {
                    let valid = false;
                    if (maxNumMasterDevicePerOrg !== "" && Number.isInteger(Number(maxNumMasterDevicePerOrg))) valid = true;
                    if (valid) {
                        return true;
                    } else {
                        return "Please type an integer number";
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
                name: 'TELEGRAM_BOTTOKEN',
                message: 'Telegram boottoken: ',
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
                name: 'NOTIFICATIONS_EMAIL_ADDRESS',
                message: 'Email account for platform notifications: ',
                validate: function (email) {
                    valid = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email)
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
                name: 'NFS_SERVER_IP',
                message: 'Nfs server IP: ',
                when: () => numSwarmNodes > 1,
                validate: function (ipAddress) {
                    valid = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ipAddress)
                    if (valid) {
                        return true;
                    } else {
                        return "Please type a valid IP address";
                    }
                }
            },
            {
                name: 'FLOATING_IP_ADDRES',
                message: 'Floating IP address: ',
                when: () => numSwarmNodes > 1,
                validate: function (ipAddress) {
                    valid = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ipAddress)
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
                when: () => numSwarmNodes > 1,
                validate: function (networkInterface) {
                    if (networkInterface.length < 4) {
                        return true;
                    } else {
                        return "Please type at least 4 characters";
                    }
                }
            }
        ])
        .then(async (answers) => {
            const osi4iotState = {
                platformInfo: {
                    PLATFORM_NAME: answers.PLATFORM_NAME,
                    DOMAIN_NAME: answers.DOMAIN_NAME,
                    PLATFORM_PHRASE: answers.PLATFORM_PHRASE,
                    MAIN_ORGANIZATION_NAME: answers.MAIN_ORGANIZATION_NAME,
                    MAIN_ORGANIZATION_ACRONYM: answers.MAIN_ORGANIZATION_ACRONYM,
                    MAIN_ORGANIZATION_ADDRESS1: answers.MAIN_ORGANIZATION_ADDRESS1,
                    MAIN_ORGANIZATION_CITY: answers.MAIN_ORGANIZATION_CITY,
                    MAIN_ORGANIZATION_ZIP_CODE: answers.MAIN_ORGANIZATION_ZIP_CODE,
                    MAIN_ORGANIZATION_STATE: answers.MAIN_ORGANIZATION_STATE,
                    MAIN_ORGANIZATION_COUNTRY: answers.MAIN_ORGANIZATION_COUNTRY,
                    MIN_LONGITUDE: answers.MIN_LONGITUDE,
                    MAX_LONGITUDE: answers.MAX_LONGITUDE,
                    MIN_LATITUDE: answers.MIN_LATITUDE,
                    MAX_LATITUDE: answers.MAX_LATITUDE,
                    DEFAULT_TIME_ZONE: answers.DEFAULT_TIME_ZONE,
                    REGISTRATION_TOKEN_LIFETIME: answers.REGISTRATION_TOKEN_LIFETIME,
                    REFRESH_TOKEN_LIFETIME: answers.REFRESH_TOKEN_LIFETIME,
                    REFRESH_TOKEN_SECRET: nanoid(20).replace(/-/g, "x").replace(/_/g, "X"),
                    ACCESS_TOKEN_SECRET: nanoid(20).replace(/-/g, "x").replace(/_/g, "X"),
                    ACCESS_TOKEN_LIFETIME: answers.ACCESS_TOKEN_LIFETIME,
                    MQTT_SSL_CERTS_VALIDITY_DAYS: parseInt(answers.MQTT_SSL_CERTS_VALIDITY_DAYS, 10),
                    ENCRYPTION_SECRET_KEY: nanoid(32).replace(/-/g, "x").replace(/_/g, "X"),
                    PLATFORM_ADMIN_FIRST_NAME: answers.PLATFORM_ADMIN_FIRST_NAME,
                    PLATFORM_ADMIN_SURNAME: answers.PLATFORM_ADMIN_SURNAME,
                    PLATFORM_ADMIN_USER_NAME: answers.PLATFORM_ADMIN_USER_NAME,
                    PLATFORM_ADMIN_EMAIL: answers.PLATFORM_ADMIN_EMAIL,
                    PLATFORM_ADMIN_PASSWORD: answers.PLATFORM_ADMIN_PASSWORD,
                    GRAFANA_ADMIN_PASSWORD: answers.PLATFORM_ADMIN_PASSWORD,
                    POSTGRES_USER: answers.PLATFORM_ADMIN_USER_NAME,
                    POSTGRES_PASSWORD: answers.PLATFORM_ADMIN_PASSWORD,
                    POSTGRES_DB: "iot_platform_db",
                    NOTIFICATIONS_EMAIL_USER: answers.NOTIFICATIONS_EMAIL_ADDRESS,
                    NOTIFICATIONS_EMAIL_ADDRESS: answers.NOTIFICATIONS_EMAIL_ADDRESS,
                    NOTIFICATIONS_EMAIL_PASSWORD: answers.NOTIFICATIONS_EMAIL_PASSWORD,
                    MAIN_ORGANIZATION_TELEGRAM_CHAT_ID: answers.MAIN_ORGANIZATION_TELEGRAM_CHAT_ID,
                    MAIN_ORGANIZATION_TELEGRAM_INVITATION_LINK: answers.MAIN_ORGANIZATION_TELEGRAM_INVITATION_LINK,
                    TELEGRAM_BOTTOKEN: answers.TELEGRAM_BOTTOKEN,
                    GRAFANA_DB_PASSWORD: nanoid(20).replace(/-/g, "x").replace(/_/g, "X"),
                    GRAFANA_DATASOURCE_PASSWORD: nanoid(20).replace(/-/g, "x").replace(/_/g, "X"),
                    NODE_RED_ADMIN: answers.PLATFORM_ADMIN_USER_NAME,
                    NODE_RED_ADMIN_HASH: bcrypt.hashSync(answers.PLATFORM_ADMIN_PASSWORD, 8),
                    PGADMIN_DEFAULT_EMAIL: answers.PLATFORM_ADMIN_EMAIL,
                    PGADMIN_DEFAULT_PASSWORD: answers.PLATFORM_ADMIN_PASSWORD,
                    NFS_SERVER_IP: answers.NFS_SERVER_IP || '127.0.0.1',
                    FLOATING_IP_ADDRES: answers.FLOATING_IP_ADDRES || '127.0.0.1',
                    NETWORK_INTERFACE: answers.NETWORK_INTERFACE || 'eth0',
                    IS_NODERED_VOLUME_ALREADY_CREATED: 'false',
                    DEFAULT_MAX_NUMBER_MASTER_DEVICES_PER_ORG: parseInt(answers.DEFAULT_MAX_NUMBER_MASTER_DEVICES_PER_ORG, 10)
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

            for (let iorg = 1; iorg <= parseInt(answers.MAX_NUMBER_ORGS_EXPECTED, 10); iorg++) {
                osi4iotState.certs.mqtt_certs.organizations[iorg - 1] = {
                    org_hash: nanoid(16).replace(/-/g, "x").replace(/_/g, "X"),
                    master_devices: []
                }
                for (let idev = 1; idev <= parseInt(answers.DEFAULT_MAX_NUMBER_MASTER_DEVICES_PER_ORG, 10); idev++) {
                    osi4iotState.certs.mqtt_certs.organizations[iorg - 1].master_devices[idev - 1] = {
                        client_crt: "",
                        client_key: "",
                        expiration_timestamp: 0,
                        md_hash: nanoid(16).replace(/-/g, "x").replace(/_/g, "X"),
                        is_volume_created: 'false'
                    }
                    osi4iotState.certs.mqtt_certs.organizations[iorg - 1].master_devices[idev - 1].client_crt_name = "";
                    osi4iotState.certs.mqtt_certs.organizations[iorg - 1].master_devices[idev - 1].client_key_name = "";
                }
            }

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

            await confirmWorkerNodesLabelsAndRunStack(numSwarmNodes, osi4iotState);
        })
        .catch((error) => {
            if (error.isTtyError) {
                console.log("Prompt couldn't be rendered in the current environment")
            } else {
                console.log("Error in osi4iot cli: ", error)
            }
        })
}

const confirmWorkerNodesLabelsAndRunStack = async (numSwarmNodes, osi4iotState) => {
    if (numSwarmNodes === 1) {
        await runStack(osi4iotState);
    } else {
        console.log(clc.yellowBright("NOTE: Before continuing, type the following commands on the organization worker nodes:"));
        for (iorg = 1; iorg <= osi4iotState.certs.mqtt_certs.organizations.length; iorg++) {
            console.log(clc.yellowBright(`\nOrganization ${iorg}:`));
            const orgHash = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].org_hash;
            const command = `    docker node update --label-add org_hash=${orgHash}`
            console.log(clc.yellowBright(command));
        }
        console.log("");
    
        inquirer
            .prompt([{
                name: 'confirm_labels_added',
                type: 'confirm',
                message: 'Are all organization worker node labels added?',
                validate: function (confirmation) {
                    if (confirmation) {
                        return true;
                    } else {
                        return "Please add the organization worker node labels before run the platform";
                    }
                } 
            }
            ])
            .then(async (answers) => {
                if (answers.confirm_labels_added) {
                    await runStack(osi4iotState);
                }
            })
            .catch((error) => {
                if (error.isTtyError) {
                    console.log("Prompt couldn't be rendered in the current environment")
                } else {
                    console.log("Error in osi4iot cli: ", error)
                }
            });
    }
}

module.exports = async () => {
    if (fs.existsSync('./osi4iot_state.json')) {
        inquirer
            .prompt([{
                name: 'confirm_platform_initiation',
                type: 'confirm',
                message: 'An state file already exits. Do you want to reinitate the plataform anyway? ',
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