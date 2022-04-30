import fs from 'fs';
import clc from 'cli-color';
import { execSync } from 'child_process';
import execShellCommand from './execShellCommand.js';

export default async function (nfsNode, org_acronym, md_hashes_array) {
    const nodeHostName = nfsNode.nodeHostName;
    const userName = nfsNode.nodeUserName;
    const nodeIP = nfsNode.nodeIP;
    console.log(clc.green(`\nRemoving nfs folders in node ${nodeHostName}...`));
    if (!fs.existsSync('./installation_scripts')) {
        fs.mkdirSync('./installation_scripts');
    }
    if (!fs.existsSync('./installation_scripts/remove_nfs_folders.sh')) {
        execSync("curl -o ./installation_scripts/remove_nfs_folders.sh https://raw.githubusercontent.com/osi4iot/osi4iot/master/utils/osi4iot_cli/installation_scripts/remove_nfs_folders.sh", { stdio: 'ignore' });
    }
    try {
        execSync(`scp ./installation_scripts/remove_nfs_folders.sh ${userName}@${nodeIP}:/home/${userName}`);
        await execShellCommand(`ssh ${userName}@${nodeIP} sudo bash remove_nfs_folders.sh ${org_acronym} "${md_hashes_array}"`)
        execSync(`ssh ${userName}@${nodeIP} rm /home/${userName}/remove_nfs_folders.sh`);
    } catch (err) {
        console.log(clc.bgRedBright(`Error removing nfs folders in node: ${nodeHostName}\n`))
    }
}