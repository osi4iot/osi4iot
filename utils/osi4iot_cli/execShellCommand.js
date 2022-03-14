const { spawn } = require('child_process');

module.exports = (cmd) => {
    commandParameters = cmd.split(" ");
    const child = spawn(commandParameters[0], [...commandParameters.slice(1)]);
    child.stdout.on('data', (chunk) => {
        process.stdout.write(chunk.toString())
    });
    // since these are streams, you can pipe them elsewhere
    child.stderr.on('data', msg => {
        process.stdout.write(msg.toString())
    });
    child.on('close', (code) => {
        if (code !== 0) {
            console.log(`Process exited with code ${code}`);
        }
    });
}