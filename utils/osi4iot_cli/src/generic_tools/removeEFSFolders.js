import fs from 'fs';
import clc from 'cli-color';
import { execSync } from 'child_process';

export default function (efsNode, org_acronym, md_hashes_array) {
    const nodeHostName = efsNode.nodeHostName;
    console.log(clc.green(`\nRemoving efsNode folders in node ${nodeHostName}...`));
    if (!fs.existsSync('./installation_scripts')) {
        fs.mkdirSync('./installation_scripts');
    }
    if (!fs.existsSync('./installation_scripts/remove_efs_folders.sh')) {
        execSync("curl -o ./installation_scripts/remove_efs_folders.sh https://raw.githubusercontent.com/osi4iot/osi4iot/master/utils/osi4iot_cli/installation_scripts/remove_efs_folders.sh", { stdio: 'ignore' });

    }
    try {
        execSync(`ssh ${userName}@${nodeIP} 'sudo bash /installation_scripts/remove_efs_folders.sh ${org_acronym} "${md_hashes_array}"`, { stdio: 'inherit' })
    } catch (err) {
        console.log(clc.redBright(`Error removing efs folders in node: ${nodeHostName}\n`))
    }
}