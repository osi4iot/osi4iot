const { spawn } = require('child_process');

module.exports = (cmd) => {
    commandParameters = cmd.split(" ");
    return new Promise(function (resolve, reject) {
        const child = spawn(commandParameters[0], [...commandParameters.slice(1)]);
        child.stdout.on('data', (chunk) => {
            process.stdout.write(chunk.toString())
        });
        // since these are streams, you can pipe them elsewhere
        child.stderr.on('data', msg => {
            reject(msg.toString())
        });
        child.on('close', (code) => {
            resolve("Command exit with code: ", code);
        });
    });
}