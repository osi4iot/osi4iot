import fs from 'fs';
import updateFrontendConfigFile from './updateFrontendConfigFile.js';

export default function (osi4iotState) {
    const frontend_conf_file = "./config/frontend/frontend.conf"
    if (fs.existsSync(frontend_conf_file)) {
        let frontendConfFileNeedToBeUpdated = false;
        const frontendConfFileText = fs.readFileSync(frontend_conf_file, 'UTF-8');
        const frontendConfFileArray = frontendConfFileText.split("/n");

        const deploymentModeInConfigFile = frontendConfFileArray.filter(row => row.slice(0, 15) === "DEPLOYMENT_MODE")[0].slice(15);
        if (deploymentModeInConfigFile !== osi4iotState.platformInfo.DEPLOYMENT_MODE) {
            frontendConfFileNeedToBeUpdated = true;
        }

        if (frontendConfFileNeedToBeUpdated) {
            updateFrontendConfigFile(osi4iotState);
        }
    }

}