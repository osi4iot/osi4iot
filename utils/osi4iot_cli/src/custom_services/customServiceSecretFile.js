import fs from 'fs';

export default function (action, customService) {
    const serviceRef = customService.serviceRef;
    const filePath = `./secrets/${serviceRef}.txt`;

    switch (action) {
        case "CREATE_OR_UPDATE":
            const secrets_dir = "./secrets"
            if (!fs.existsSync(secrets_dir)) fs.mkdirSync(secrets_dir);
            fs.writeFileSync(filePath, customService.secretData);
            break;

        case "DELETE":
            if (fs.existsSync(filePath)) {
                fs.rmSync(filePath);
            }
            break;
        default:
            throw new Error(`Unhandled action type: ${action}`);
    }

}