import os from 'os';
import { execSync } from 'child_process'
import { chooseOption } from './chooseOption';

export default function () {
    const localNodePlatform = os.platform();
    if (localNodePlatform === "linux") {
        execSync("clear", { stdio: 'inherit' });
    } else if (localNodePlatform === "win32") {
        execSync("cls", { stdio: 'inherit' });
    }
    chooseOption();
}