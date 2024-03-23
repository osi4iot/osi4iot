declare function postMessage(message:any): void;

const fetchFemResFile = () => {
    // eslint-disable-next-line no-restricted-globals
    self.onmessage = (event: MessageEvent<any>) => {
        const { urlFemResFile, accessToken } = event.data;
        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        };
        const request = new Request(urlFemResFile, {
            method: 'GET',
            headers: new Headers(headers)
        });

        fetch(request)
            .then((resp) => resp.json())
            .then(femResData => {
                postMessage(femResData);
            })
            .catch(error => {
                throw new Error('Something went wrong in the Web Worker');
            });
    };
};

let code = fetchFemResFile.toString();
code = code.substring(code.indexOf("{") + 1, code.lastIndexOf("}"));

const blob = new Blob([code], { type: "application/javascript" });
const fetchFemResFileCode = URL.createObjectURL(blob);

export default fetchFemResFileCode;