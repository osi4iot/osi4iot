const platformInitForm = require('./platformInitForm');
const runStack = require('./runStack');
const stopStack = require('./stopStack');
const stackStatus = require('./stackStatus');
const cleanStack = require('./cleanStack');
const chooseOption = require('./chooseOption');

const osi4iotCli = async () => {
    const myArgs = process.argv.slice(2);

    if (myArgs[0]) {
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
    } else {
        chooseOption();
    }

}

osi4iotCli();

