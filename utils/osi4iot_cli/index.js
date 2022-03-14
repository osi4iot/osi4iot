const fs = require('fs');
const stackGenerator = require('./stackGenerator');
const certsGenerator = require('./certsGenerator');
const platformInitForm = require('./platformInitForm');

const osi4iotCli = async () => {
    await platformInitForm()
    // await certsGenerator();
    // const osi4iotStackYML = stackGenerator("iot.eebe.upc.edu");
    // fs.writeFileSync("./osi4iot_stack.yml", osi4iotStackYML);
}

osi4iotCli();

