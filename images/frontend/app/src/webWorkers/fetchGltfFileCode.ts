declare function postMessage(message: any): void;


const fetchGltfFile = () => {
    // eslint-disable-next-line no-restricted-globals
    self.onmessage = (event: MessageEvent<any>) => {

        const {
            digitalTwinDataType,
            urlDigitalTwinGltfFile,
            urlDigitalTwinGlbFile,
            accessToken
        } = event.data;

        let url = urlDigitalTwinGltfFile;
        let contentType = 'application/json';
        if (digitalTwinDataType === "Glb 3D model") {
            url = urlDigitalTwinGlbFile;
            contentType = 'model/gltf-binary';
        }

        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': contentType
        };
        const request = new Request(url, {
            method: 'GET',
            headers: new Headers(headers)
        });

        if (digitalTwinDataType === "Gltf 3D model") {
            fetch(request)
                .then((resp) => resp.json())
                .then(gltfData => {
                    postMessage(gltfData);
                    return gltfData
                })
                .catch(error => {
                    throw new Error('Something went wrong in the Web Worker');
                });
        } else if (digitalTwinDataType === "Glb 3D model") {
            fetch(request)
                .then((resp) => resp.blob())
                .then(glbFileData => {
                    postMessage(glbFileData);
                    return glbFileData
                })
                .catch(error => {
                    throw new Error('Something went wrong in the Web Worker');
                });
        }
    };
};

let code = fetchGltfFile.toString();
code = code.substring(code.indexOf("{") + 1, code.lastIndexOf("}"));

const blob = new Blob([code], { type: "application/javascript" });
const fetchGltfFileCode = URL.createObjectURL(blob);

export default fetchGltfFileCode;