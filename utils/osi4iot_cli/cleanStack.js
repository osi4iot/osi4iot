const execSync = require('child_process').execSync;
const execShellCommand = require('./execShellCommand')

module.exports = async () => {
    const response = execSync("docker service ls");
    const numServices = response.toString().split('\n').length - 2;
    if (numServices !== 0) {
        await execShellCommand("docker stack rm osi4iot");
    }
    await execShellCommand("docker system prune --force");
    await execShellCommand("docker volume prune --force");
}