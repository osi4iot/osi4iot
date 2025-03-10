import { AxiosProgressEvent } from "axios";
import { IThreeMesh } from "../components/PlatformAssistant/DigitalTwin3DViewer/threeInterfaces";
import { PLATFORM_ASSISTANT_ROUTES } from "../components/PlatformAssistant/Utils/platformAssistantOptions";
import { IWindowObjectReferences, PlatformAssistantDispatch } from "../contexts/platformAssistantContext/interfaces";


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

export const getDomainName = (): string => {
    const location = window.location.href;
    let domainName = location.split("/")[2];
    // if (domainName === "localhost:3000") domainName = "localhost";  //Development case
    //if (domainName === "localhost:3000") domainName = "iot.eebe.upc.edu";
    if (domainName === "localhost:3000") domainName = "dicapuaiot.com";
    //if (domainName === "localhost:3000") domainName = "iot-fibre4yards.com";
    // if (domainName === "localhost:3000") domainName = "osi4iot.com";
    // if (domainName === "localhost:3000") domainName = "dev.iot-rafa.tk";
    return domainName;
}

export const getProtocol = (): string => {
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

const progressFun = (
    progressEvent: AxiosProgressEvent, 
    totalFileSize: number, 
    setGltfFileDownloadProgress: (progress: number) => void
) => {
    const current = progressEvent.loaded as number;
    let percentCompleted = Math.floor(current / totalFileSize * 100);
    setGltfFileDownloadProgress(percentCompleted);
  }

export const axiosAuthDigitalTwinFile = (
    token: string, 
    digitalTwinType: string, 
    gltfFileSize: number,
    setGltfFileDownloadProgress: (progress: number) => void
) => {
    let config = {};

    if (digitalTwinType === "Gltf 3D model") {

        config = {
            headers: {
                Authorization: "Bearer " + token,
                "Content-Type": "application/json"
            },
            responseType: "json" as ResponseType,
            onDownloadProgress: (progressEvent: AxiosProgressEvent) => progressFun(
                progressEvent, 
                gltfFileSize, 
                setGltfFileDownloadProgress
            )
        };
    } else if (digitalTwinType === "Glb 3D model") {
        config = {
            headers: {
                Authorization: "Bearer " + token,
                "Content-Type": "model/gltf-binary"
            },
            responseType: "blob" as ResponseType,
            onDownloadProgress: (progressEvent: AxiosProgressEvent) => progressFun(
                progressEvent, 
                gltfFileSize, 
                setGltfFileDownloadProgress
            )
        };
    }
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


export const digitalTwinFormatValidation = (value: any) => {
    let output = false;
    try {
        let obj = value;
        if (typeof value === 'string') obj = JSON.parse(value);
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
        animationType: string;
        topicType: string;
        objectOnOff: string;
        type: string;
        fieldName: string;
        timeout: number;
        assetPartIndex: number;
        clipNames: string[];
        clipTopicType: string;
        clipFieldName: string;
        clipMaxValue: number;
        clipMinValue: number;
        sensorRef: string;
        sensorId: number;
        topicRef: string;
        description: string;
        payloadKey: string;
        paramLabel: string;
        valueType: string;
        units: string;
        dashboardRefresh: string;
        dashboardTimeWindow: string;
        topicId: number;
    };
}

const objectTypeList = ["asset", "sensor", "generic", "custom", "display", "femObject"];
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

const clipKeys = [
    "animationType",
    "clipNames",
    "clipTopicType",
    "clipFieldName",
    "clipMaxValue",
    "clipMinValue"
];

const clipEntriesConditional = (key: string) => {
    return clipKeys.indexOf(key) !== -1;
};

const optionalEntriesTypes = (key: string): string => {
    if (key === "opacity") return 'number';
    else return 'string';
};

const sensorEntriesConditional = (key: string) => {
    const keysArray = [
        "topicType",
        "fieldName",
        "timeout",
    ];
    return keysArray.indexOf(key) !== -1;
}

const assetEntriesConditional = (key: string) => {
    const keysArray = [
        "assetPartIndex",
    ];
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
    // Length verification
    let message = "OK";
    let wrongEntriesMessage = `For objects of type: ${objectType} the custom properties: ${expectedKeys} are required`;
    if (objectType === "blenderAnimationTempObject") {
        wrongEntriesMessage = `For objects with temporary Blender animations the custom properties: ${expectedKeys.join(", ")} are required`;
        if (entries.length !== expectedKeys.length) {
            return wrongEntriesMessage;
        }
    } else if (objectType === "blenderAnimationEndlessObject") {
        wrongEntriesMessage = `For objects with endless Blender animations the custom property: ${expectedKeys[0]} is required`;
        if (entries[0][0] !== expectedKeys[0] as string) {
            return wrongEntriesMessage;
        }
    } else {
        if (entries.length !== expectedKeys.length) {
            return wrongEntriesMessage;
        }
    }

    // Type verification
    let arrayLength = 0;
    for (const entry of entries) {
        const index = expectedKeys.indexOf(entry[0]);
        if (index === -1) {
            return wrongEntriesMessage;
        } else {
            let expectedValueType = expectedValuesTypes[index];
            let wrongTypeMessage = `The custom property ${entry[0]} must be of type ${expectedValueType}.`;

            if (typeof entry[1] !== expectedValueType) return wrongTypeMessage;
            if (expectedValueType === "object") {
                if (Array.isArray(entry[1])) {
                    if (entry[1].length !== 0) {
                        for (const value of entry[1]) {
                            if (arrayTypes[index] !== typeof value) return wrongTypeMessage;
                        }
                        if (arrayLength === 0) arrayLength = entry[1].length;
                        if (entry[1].length !== arrayLength) {
                            return `The custom properties ${expectedKeys.join(", ")} must be arrays of equal size.`;
                        };
                        if (entry[0] === 'clipTopicType') {
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
    if (typeof gltfFileData === "string") gltfFileData = JSON.parse(gltfFileData);
    if (Object.keys(gltfFileData).length === 0) {
        return "ERROR";
    }
    if (gltfFileData.nodes?.length === 0) {
        return "ERROR";
    }
    return message;
}

export const checkGltfFile_Old = (gltfFileData: any): string => {
    let message = "OK";
    if (Object.keys(gltfFileData).length && gltfFileData.nodes?.length !== 0) {
        const meshNodes: IMeshNode[] = [];
        gltfFileData.nodes.forEach((node: IMeshNode) => {
            // node.mesh are not included for taking into account root nodes
            if (node.extras !== undefined) meshNodes.push(node);
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


            if (objectType === "asset") {
                const assetKeys = ['assetPartIndex'];
                const assetValuesTypes = ['number'];
                const entries = Object.entries(node.extras).filter(entry =>
                    assetEntriesConditional(entry[0])
                );
                const message = checkExtrasEntries(objectType, entries, assetKeys, assetValuesTypes);
                if (message !== "OK") {
                    return message;
                };
            }

            if (objectType === "sensor") {
                const sensorKeys = ['topicType', 'fieldName', 'timeout'];
                const sensorValuesTypes = ['string', 'string', 'number'];
                const entries = Object.entries(node.extras).filter(entry =>
                    sensorEntriesConditional(entry[0])
                );
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
                let message = "OK";
                if (node.extras.animationType === "blenderTemporary") {
                    const clipValuesTypes = ['string', 'object', 'object', 'object', 'object', 'object'];
                    const arrayTypes = ['string', 'string', 'string', 'string', 'number', 'number'];
                    message = checkExtrasEntries("blenderAnimationTempObject", clipEntries, clipKeys, clipValuesTypes, arrayTypes);
                } else if (node.extras.animationType === "blenderEndless") {
                    const clipValuesTypes = ['string', 'object', 'object', 'object', 'object', 'object'];
                    const arrayTypes = ['string', 'string', 'string', 'string', 'number', 'number'];
                    message = checkExtrasEntries("blenderAnimationEndlessObject", clipEntries, clipKeys, clipValuesTypes, arrayTypes);
                }
                if (message !== "OK") {
                    return message;
                };
            }
        }
    }
    return message;
}


export const changeMaterialPropRecursively = (
    obj: IThreeMesh,
    prop: string,
    propValue: string | number | boolean | THREE.Color
) => {
    if (prop === "emissive" &&
        (obj.userData.displayType === "digit" || obj.userData.displayType === "letterOrSymbol")) {
        return;
    }
    if ((obj.material as THREE.Material) && (obj.material as any)[prop] !== undefined) {
        (obj.material as any)[prop] = propValue;
    }
    let newPropValue = propValue;
    if (prop === 'transparent') {
        newPropValue = true;
    }
    for (let node of obj.children) {
        changeMaterialPropRecursively(
            node as IThreeMesh,
            prop,
            newPropValue
        );
    }
}

export const openWindowTab = (
    url: string,
    plaformAssistantDispatch: any,
    windowObjectReferences: Record<string, Window | null>,
    setWindowObjectReferences: (plaformAssistantDispatch: PlatformAssistantDispatch, data: IWindowObjectReferences) => void,
) => {
    const serviceName = (url.split("/")[3]).split("_")[0];
    let name = "";
    if (serviceName === "grafana") {
        name = (url.split("/")[6]).split("?")[0];
    } else if (serviceName === "nodered") {
        name = url.split("/")[3];
    }

    if (name !== "") {
        if (!windowObjectReferences[name] || windowObjectReferences[name]?.closed) {
            const windowObjectRef = window.open(url, name);
            windowObjectRef?.focus();
            windowObjectReferences[name] = windowObjectRef;
            setWindowObjectReferences(plaformAssistantDispatch, { windowObjectReferences });
        } else {
            windowObjectReferences[name]?.focus();
        }
    }
}

export interface IOption {
    value: string;
    label: string;
}

export const convertArrayToOptions = (vector: string[]): IOption[] => {
    const options: IOption[] = [];
    for (const elem of vector) {
        const option: IOption = {
            label: elem,
            value: elem
        }
        options.push(option);
    }
    return options;
}

export const giveDefaultNumWebWorkers = () => {
    let numWebWorkers = 1;
    if (window.navigator.hardwareConcurrency) {
        if (window.navigator.hardwareConcurrency >= 4) {
            numWebWorkers = 4;
        }
    }
    return numWebWorkers;
}

export const giveMaxNumWebWorkers = () => {
    let maxNumWebWorkers = 1;
    if (window.navigator.hardwareConcurrency) {
        maxNumWebWorkers = window.navigator.hardwareConcurrency;
    }
    return maxNumWebWorkers;
}

export const giveBrowserType = () => {
    let browserType = "Chrome";
    if ((navigator.userAgent.indexOf("Opera") || navigator.userAgent.indexOf('OPR')) !== -1) {
        browserType ='Opera';
      } else if (navigator.userAgent.indexOf("Edg") !== -1) {
        browserType = 'Edge';
      } else if (navigator.userAgent.indexOf("Chrome") !== -1) {
        browserType = 'Chrome';
      } else if (navigator.userAgent.indexOf("Safari") !== -1) {
        browserType = 'Safari';
      } else if (navigator.userAgent.indexOf("Firefox") !== -1) {
        browserType = 'Firefox';
      } else if ((navigator.userAgent.indexOf("MSIE") !== -1)) {
        browserType = 'IE';
      } else {
        browserType = 'unknown';
      }
    return browserType;
}

