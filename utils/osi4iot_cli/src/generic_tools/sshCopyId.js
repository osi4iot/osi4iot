import { execSync } from 'child_process';
import os from 'os';

export default function(userName, nodeIP) {
	const localNodePlatform = os.platform();
	return new Promise(function (resolve, reject) {
		setTimeout(() => {
			try {
				if (localNodePlatform === "linux") {
					execSync(`ssh-copy-id -i ./.osi4iot_keys/osi4iot_key ${userName}@${nodeIP}`, { stdio: 'ignore' });
				} else if (localNodePlatform === "win32") {
					execSync(`cat ./.osi4iot_keys/osi4iot_key.pub | ssh ${userName}@${nodeIP} "umask 077; test -d .ssh || mkdir .ssh ; cat >> .ssh/authorized_keys || exit 1"`, { stdio: 'inherit', shell: 'powershell.exe' });
				}
			} catch (err) {
				reject("Failed")
			}
			resolve("OK")
		}, 200);
	});
}