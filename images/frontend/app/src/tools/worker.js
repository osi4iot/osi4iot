const workercode = () => {
    // eslint-disable-next-line no-restricted-globals
    self.onmessage = function (event) {
        console.log('Received message from the main thread:', event.data);

        // Perform some computation
        const result = JSON.stringify(event.data);

        // Send the result back to the main thread
        postMessage(result);
    };
};

let code = workercode.toString();
code = code.substring(code.indexOf("{") + 1, code.lastIndexOf("}"));

const blob = new Blob([code], { type: "application/javascript" });
const worker_script = URL.createObjectURL(blob);

export default worker_script;