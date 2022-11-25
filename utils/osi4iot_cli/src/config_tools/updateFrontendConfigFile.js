import fs from 'fs';

export default function (osi4iotState) {
    const frontend_conf_file = "./config/frontend/frontend.conf"
	if (fs.existsSync(frontend_conf_file)) {
		fs.rmSync('./config/frontend/frontend.conf');
	}

    const frontendConfig = [
        `PLATFORM_NAME=${osi4iotState.platformInfo.PLATFORM_NAME.replace(/ /g, "_")}\n`,
        `DOMAIN_NAME=${osi4iotState.platformInfo.DOMAIN_NAME}\n`,
        `PROTOCOL=${protocol}\n`,
        insertQuotesInText("DEPLOYMENT_LOCATION", osi4iotState.platformInfo.DEPLOYMENT_LOCATION, "\n"),
        `DEPLOYMENT_MODE=${osi4iotState.platformInfo.DEPLOYMENT_MODE}\n`,
        `MIN_LONGITUDE=${osi4iotState.platformInfo.MIN_LONGITUDE}\n`,
        `MAX_LONGITUDE=${osi4iotState.platformInfo.MAX_LONGITUDE}\n`,
        `MIN_LATITUDE=${osi4iotState.platformInfo.MIN_LATITUDE}\n`,
        `MAX_LATITUDE=${osi4iotState.platformInfo.MAX_LATITUDE}`,
    ];
    
    for (let iline = 0; iline < frontendConfig.length; iline++) {
        fs.appendFileSync(frontend_conf_file, frontendConfig[iline]);
    }

    osi4iotState.frontend_conf_file_name = `frontend_conf_file_name_${md5(frontendConfig)}`;
}