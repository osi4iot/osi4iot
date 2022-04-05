import fs from 'fs';

export default function() {
    let areConfigsCreated = true;

    const admin_api_conf_dir = "./config/admin_api";
    if (!fs.existsSync(admin_api_conf_dir)) {
        areConfigsCreated = false;
    }

    const frontend_conf_dir = "./config/frontend";
    if (!fs.existsSync(frontend_conf_dir)) {
        areConfigsCreated = false;
    }

    const grafana_conf_dir = "./config/grafana";
    if (!fs.existsSync(grafana_conf_dir)) {
        areConfigsCreated = false;
    }

    const mosquitto_conf_dir = "./config/mosquitto";
    if (!fs.existsSync(mosquitto_conf_dir)) {
        areConfigsCreated = false;
    }

    const nodered_conf_dir = "./config/nodered";
    if (!fs.existsSync(nodered_conf_dir)) {
        areConfigsCreated = false;
    }

    return areConfigsCreated;
}