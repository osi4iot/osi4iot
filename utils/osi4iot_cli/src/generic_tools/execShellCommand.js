import { spawn } from 'child_process';

export default function execShellCommand(cmd, options = {}) {
    const commandParameters = cmd.split(" ").filter(param => param !== "");
    return new Promise((resolve, reject) => {
        const child = spawn(commandParameters[0], [...commandParameters.slice(1)], options);

        let stdoutData = '';
        let stderrData = '';

        child.stdout.on('data', (chunk) => {
            stdoutData += chunk.toString();
        });

        child.stderr.on('data', (chunk) => {
            stderrData += chunk.toString();
        });

        child.on('close', (code) => {
            // Verificamos si el stderr contiene el mensaje específico sobre el comportamiento del detach.
            if (stderrData.includes("Since --detach=false was not specified")) {
                // Lo tratamos como éxito, porque es solo una advertencia, no un error fatal.
                resolve(stdoutData);
            } else if (code === 0) {
                resolve(stdoutData);
            } else {
                reject(`Error code: ${code}\nError: ${stderrData}`);
            }
        });

        child.on('error', (err) => {
            reject(`Failed to start process: ${err.message}`);
        });
    });
}