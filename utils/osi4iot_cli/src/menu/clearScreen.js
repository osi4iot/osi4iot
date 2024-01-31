import os from 'os';
import { execSync } from 'child_process'

export default function () {
    const localNodePlatform = os.platform();
    if (localNodePlatform === "linux") {
        execSync("clear", { stdio: 'inherit' });
    } else if (localNodePlatform === "win32") {
        execSync("cls", { stdio: 'inherit' });
    }
}