const execShellCommand = require('./execShellCommand');

module.exports = async () => {
    await execShellCommand("docker stack rm osi4iot");
}