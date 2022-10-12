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

export const axiosAuth = (token: string) => {
    const config = {
        headers: {
            Authorization: "Bearer " + token,
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