declare function postMessage(message: any): void;


const fetchGltfFile = () => {
    // eslint-disable-next-line no-restricted-globals
    self.onmessage = (event: MessageEvent<any>) => {
        const { urlDigitalTwinGltfData, accessToken } = event.data;

        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        };
        const request = new Request(urlDigitalTwinGltfData, {
            method: 'GET',
            headers: new Headers(headers)
        });

        fetch(request)
            .then((resp) => resp.json())
            .then(gltfData => {
                postMessage(gltfData);
                return gltfData
            })
            .catch(error => {
                throw new Error('Something went wrong in the Web Worker');
            });
    };
};

let code = fetchGltfFile.toString();
code = code.substring(code.indexOf("{") + 1, code.lastIndexOf("}"));

const blob = new Blob([code], { type: "application/javascript" });
const fetchGltfFileCode = URL.createObjectURL(blob);

export default fetchGltfFileCode;