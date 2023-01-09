import { PLATFORM_ASSISTANT_ROUTES } from "../components/PlatformAssistant/Utils/platformAssistantOptions";
import axios, { AxiosStatic } from 'axios';
import createAuthRefreshInterceptor from 'axios-auth-refresh';

export const isRegistrationRequest = () => {
    let isRegistrationReq = false;
    const location = window.location.href;
    const wordsArray = location.split("/");
    if (wordsArray[3].slice(0, 8) === "register") isRegistrationReq = true; //Development case

    //Production case
    if (wordsArray[3] === "admin") {
        if (wordsArray[4].slice(0, 8) === "register") isRegistrationReq = true;
    }

    return isRegistrationReq
};

export const getDomainName = () => {
    const location = window.location.href;
    let domainName = location.split("/")[2];
    // if (domainName === "localhost:3000") domainName = "localhost";  //Development case
    if (domainName === "localhost:3000") domainName = "iot.eebe.upc.edu";
    return domainName;
}

export const getProtocol = () => {
    let protocol = "https";
    if (window._env_ && window._env_.PROTOCOL === "http") {
        protocol = "http";
    }
    return protocol;
}

export const isValidText = (text: string): boolean => {
    let isValid = true;
    if (text.trim() === "") isValid = false;
    return isValid;
};

export const isValidNumber = (value: number, limitValue: number): boolean => {
    let isValid = true;
    if (value < limitValue) isValid = false;
    return isValid;
};

export const isValidEmail = (email: string): boolean => {
    let isValid = true;
    /* eslint-disable no-useless-escape */
    /* eslint-disable max-len */
    const EMAIL_REGEX = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

    if (!EMAIL_REGEX.test(email)) {
        isValid = false;
    }
    return isValid;
};

export const isValidPassword = (password: string): boolean => {
    let isValid = true;
    if (password.trim() === "" || password.trim().length < 4) isValid = false;
    return isValid;
};

export const axiosAuth = (token: string, contentType: string = 'application/json') => {
    const config = {
        headers: {
            Authorization: "Bearer " + token,
            "Content-Type": contentType
        },
    };
    return config;
};


export const toFirstLetterUpperCase = (text: string) => {
    const textModified = text.charAt(0).toLocaleUpperCase() + text.slice(1);
    return textModified;
}

export const getPlatformAssistantPathForUserRole = (userRole: string) => {
    let platformAssistantPath = PLATFORM_ASSISTANT_ROUTES.HOME;
    if (userRole === "PlatformAdmin") platformAssistantPath = PLATFORM_ASSISTANT_ROUTES.PLATFORM_ADMIN;
    else if (userRole === "OrgAdmin") platformAssistantPath = PLATFORM_ASSISTANT_ROUTES.ORG_ADMIN;
    else if (userRole === "GroupAdmin") platformAssistantPath = PLATFORM_ASSISTANT_ROUTES.GROUP_ADMIN;
    else if (userRole === "User") platformAssistantPath = PLATFORM_ASSISTANT_ROUTES.USER;
    return platformAssistantPath;
}

export const axiosInstance = (refreshToken: string, authDispatch: any): AxiosStatic => {
    const domainName = getDomainName();
    const protocol = getProtocol();

    const udpateTokenUrl = `${protocol}://${domainName}/admin_api/auth/update_token`;
    const config = axiosAuth(refreshToken);

    // Function that will be called to refresh authorization
    const refreshAuthLogic = (failedRequest: any) => axios.patch(udpateTokenUrl, null, config).then(tokenRefreshResponse => {
        const data = tokenRefreshResponse.data;
        localStorage.setItem('iot_platform_auth', JSON.stringify(data));
        authDispatch({ type: 'REFRESH_TOKEN', payload: data });
        failedRequest.response.config.headers['Authorization'] = 'Bearer ' + tokenRefreshResponse.data.accessToken;
        return Promise.resolve();
    });

    // Instantiate the interceptor (you can chain it as it returns the axios instance)
    createAuthRefreshInterceptor(axios, refreshAuthLogic);
    return axios;
}

export const digitalTwinFormatValidation = (value: any) => {
    let output = false;
    try {
        const obj = JSON.parse(value);
        const keys = Object.keys(obj);
        if (keys.length === 0) {
            output = true;
        } else {
            let isAnyFieldWrong = false;
            for (const key of keys) {
                if (obj[key].label === undefined || typeof obj[key].label !== "string") {
                    isAnyFieldWrong = true;
                    break;
                }
                if (obj[key].units === undefined || typeof obj[key].units !== "string") {
                    isAnyFieldWrong = true;
                    break;
                }
                if (obj[key].minValue === undefined || typeof obj[key].minValue !== "number") {
                    isAnyFieldWrong = true;
                    break;
                }
                if (obj[key].maxValue === undefined || typeof obj[key].maxValue !== "number") {
                    isAnyFieldWrong = true;
                    break;
                }
                if (obj[key].defaultValue === undefined || typeof obj[key].defaultValue !== "number") {
                    isAnyFieldWrong = true;
                    break;
                }
                if (obj[key].step === undefined || typeof obj[key].step !== "number") {
                    isAnyFieldWrong = true;
                    break;
                }
            }
            if (!isAnyFieldWrong) output = true;
        }
    } catch (err) {
        return false;
    }
    return output;
}

export interface IMeshNode {
    name?: string;
    mesh?: number;
    extras: {
        topicType: string;
        type: string;
        fieldName: string;
        timeout: number;
        assetPartIndex: number;
        clipNames: string[];
        clipTopicTypes: string[];
        clipFieldNames: string[];
        clipMaxValues: number[];
        clipMinValues: number[];
    };
}

const objectTypeList = ["asset", "sensor", "generic", "femObject"];
const optionalKeys = [
    "type",
    "visible",
    "opacity",
    "collectionName",
    "selectable",
];
const optionalEntriesConditional = (key: string) => {
    return optionalKeys.indexOf(key) !== -1;
}

const clipKeys = ['clipNames', 'clipTopicTypes', 'clipFieldNames', 'clipMaxValues', 'clipMinValues'];
const clipEntriesConditional = (key: string) => {
    return clipKeys.indexOf(key) !== -1;
};

const optionalEntriesTypes = (key: string): string => {
    if (key === "opacity") return 'number';
    else return 'string';
};

const objectExtraEntriesConditional = (key: string) => {
    const keysArray = [...optionalKeys, ...clipKeys];
    return keysArray.indexOf(key) === -1;
}


const checkOptionalEntries = (entries: [string, string | number | string[] | number[]][]): string => {
    let message = "OK";
    for (const entry of entries) {
        if (optionalEntriesTypes(entry[0]) !== typeof entry[1]) {
            return `The custom property ${entry[0]} must be of type ${optionalEntriesTypes(entry[0])}`;
        }
    }
    return message;
}

const checkExtrasEntries = (
    objectType: string,
    entries: [string, string | number | string[] | number[]][],
    expectedKeys: string[],
    expectedValuesTypes: string[],
    arrayTypes: string[] = []
): string => {
    let message = "OK";
    let arrayLength = 0;
    let wrongEntriesMessage = `For objects of type: ${objectType} the custom properties: ${expectedKeys} are required`;
    if (objectType === "animatedObject") {
        wrongEntriesMessage = `For objects with animations the custom properties: ${expectedKeys.join(", ")} are required`;
    }
    if (entries.length !== expectedKeys.length) {
        return wrongEntriesMessage;
    }
    for (const entry of entries) {
        const index = expectedKeys.indexOf(entry[0]);
        if (index === -1) {
            return wrongEntriesMessage;
        } else {
            let expectedType = expectedValuesTypes[index];
            if (objectType === "animatedObject") expectedType = "array";
            let wrongTypeMessage = `The custom property ${entry[0]} must be of type ${expectedType}.`;

            if (typeof entry[1] !== expectedValuesTypes[index]) return wrongTypeMessage;
            if (expectedValuesTypes[index] === "object") {
                if (Array.isArray(entry[1])) {
                    if (entry[1].length !== 0) {
                        for (const value of entry[1]) {
                            if (arrayTypes[index] !== typeof value) return wrongTypeMessage;
                        }
                        if (arrayLength === 0) arrayLength = entry[1].length;
                        if (entry[1].length !== arrayLength) {
                            return `The custom properties ${expectedKeys.join(", ")} must be arrays of equal size.`;
                        };
                        if (entry[0] === 'clipTopicTypes') {
                            const clipTopicTypeErrorMessage = `The custom property clipTopicType must has the format dev2pdb_<i>.`;
                            for (let i = 0; i < entry[1].length; i++) {
                                const value = entry[1][i] as string;
                                if (value.slice(0, 8) !== "dev2pdb_" || typeof value.slice(8) === 'number') {
                                    return clipTopicTypeErrorMessage;
                                }
                            }
                        }
                    } else {
                        return `The custom property ${entry[0]} cannot be an array of size zero.`;
                    };
                } else return wrongTypeMessage;
            }
        }
    }
    return message;
}

export const checkGltfFile = (gltfFileData: any): string => {
    let message = "OK";
    if (Object.keys(gltfFileData).length && gltfFileData.nodes?.length !== 0) {
        const meshNodes: IMeshNode[] = [];
        gltfFileData.nodes.forEach((node: IMeshNode) => {
            if (node.mesh !== undefined && node.extras !== undefined) meshNodes.push(node);
        })

        for (const node of meshNodes) {
            if (node.extras.type === undefined) continue;
            const objectType = node.extras.type;

            if (node.name === undefined) return "The name of the object is not defined.";
            const nodeName = node.name;
            if (objectTypeList.indexOf(objectType) === -1) {
                return `Object ${nodeName}: The custom property type is not recognized`;
            }
            const optionalEntries = Object.entries(node.extras).filter(entry =>
                optionalEntriesConditional(entry[0])
            );
            const optionalEntriesMessage = checkOptionalEntries(optionalEntries);
            if (optionalEntriesMessage !== "OK") return optionalEntriesMessage;

            const entries = Object.entries(node.extras).filter(entry =>
                objectExtraEntriesConditional(entry[0])
            );

            if (objectType === "asset") {
                const assetKeys = ['assetPartIndex'];
                const assetValuesTypes = ['number'];
                const message = checkExtrasEntries(objectType, entries, assetKeys, assetValuesTypes);
                if (message !== "OK") {
                    return message;
                };
            }

            if (objectType === "sensor") {
                const sensorKeys = ['topicType', 'fieldName', 'timeout'];
                const sensorValuesTypes = ['string', 'string', 'number']
                const message = checkExtrasEntries(objectType, entries, sensorKeys, sensorValuesTypes);
                if (message !== "OK") {
                    return message;
                };
            }

            const clipEntries = Object.entries(node.extras).filter(entry =>
                clipEntriesConditional(entry[0])
            );
            const clipEntriesKeys = clipEntries.map(entry => entry[0]);
            const isObjectWithClip = clipEntriesKeys.filter(key => clipKeys.indexOf(key) !== -1).length !== 0;
            if (isObjectWithClip) {
                const clipValuesTypes = ['object', 'object', 'object', 'object', 'object'];
                const arrayTypes = ['string', 'string', 'string', 'number', 'number'];
                const message = checkExtrasEntries("animatedObject", clipEntries, clipKeys, clipValuesTypes, arrayTypes);
                if (message !== "OK") {
                    return message;
                };
            }
        }
    }
    return message;
}