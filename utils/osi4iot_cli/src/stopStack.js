import execShellCommand from './execShellCommand.js';

export default async function() {
    await execShellCommand("docker stack rm osi4iot");
}