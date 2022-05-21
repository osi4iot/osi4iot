import os from 'os';
import clc from 'cli-color';
import { execSync } from 'child_process';

export default async function (nodeIP) {
    let isLocahostNode = false;
    if (nodeIP === "localhost" || nodeIP === "127.0.0.1") {
        isLocahostNode = true;
    } else {
        const platform = os.platform();
        if (platform === "linux") {
            const ifconfig = execSync("ifconfig").toString();
            if (ifconfig.includes(`inet ${nodeIP}`)) isLocahostNode = true;
        } else if (platform === "win32") {
            const ipconfig = execSync("ipconfig").toString();
            if (ipconfig.includes(`Dirección IPv4. . . . . . . . . . . . . . : ${nodeIP}`)) isLocahostNode = true;
    
        } else {
            console.log(clc.redBright("\nError: Only linux and win32 platform are supported"));
        }
    }
    return isLocahostNode;
}