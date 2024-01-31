import fs from 'fs';

export default function (action, customService) {
    const config_dir = "./config"
	if (!fs.existsSync(config_dir)) {
		fs.mkdirSync(config_dir);
    }
    const serviceRef = customService.serviceRef;
    const csvc_config_dir = `./config/${serviceRef}`;
    const filePath = `${csvc_config_dir}/${serviceRef}.conf`;

    switch (action) {
        case "CREATE_OR_UPDATE":
            if (!fs.existsSync(csvc_config_dir)) {
                fs.mkdirSync(csvc_config_dir);
            }
            fs.writeFileSync(filePath, customService.configData);
            break;

        case "DELETE":
            if (fs.existsSync(filePath)) {
                fs.rmSync(csvc_config_dir, { recursive: true, force: true });
            }
            break;
        default:
            throw new Error(`Unhandled action type: ${action}`);
    }

}