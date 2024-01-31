import needle from 'needle';
import fs from 'fs';
import login from '../menu/login.js';

export default async function () {
    let nodeRedInstances = [];
    if (fs.existsSync('./osi4iot_state.json')) {
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
			nodeRedInstances = await needle('get', urlGetNodeRedInstances, optionsToken)
				.then(res => res.body)
				.catch(err => console.log("Get nodered instance error: %s", err.message));


        }
    }
    return nodeRedInstances;
}