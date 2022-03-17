const fs = require('fs');
const platformInitForm = require('./platformInitForm');
const runStack = require('./runStack');
const stopStack = require('./stopStack');
const stackStatus = require('./stackStatus');
const cleanStack = require('./cleanStack');
const execSync = require('child_process').execSync;

const osi4iotCli = async () => {
    const myArgs = process.argv.slice(2);

    switch (myArgs[0]) {
        case 'init':
            await platformInitForm();
            break;
        case 'run':
            await runStack();
            break;
        case 'stop':
            await stopStack();
            break;
        case 'status':
            await stackStatus();
            break;
        case 'clean':
            await cleanStack();
            break;
        default:
            console.log('Incorrect argument. Option are: init, run, stop, status or clean.');
    }

}

osi4iotCli();

