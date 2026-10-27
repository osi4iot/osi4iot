import axios, { AxiosInstance, AxiosResponse } from 'axios';
import refreshTokenRequest from "./refreshTokenRequest";

// El interceptor que renueva el token se registra una sola vez (antes se añadía uno nuevo en cada
// petición y se iban acumulando). Usa siempre el refreshToken y el authDispatch más recientes.
let latestRefreshToken = "";
let latestAuthDispatch: any = null;
let interceptorRegistered = false;

export const getAxiosInstance = (refreshToken: string, authDispatch: any): AxiosInstance => {
    latestRefreshToken = refreshToken;
    latestAuthDispatch = authDispatch;
    if (interceptorRegistered) return axios;
    interceptorRegistered = true;

    axios.interceptors.response.use((response: AxiosResponse<any, any>) => {
        return response
    }, async (error: any) => {
        const config = error.config;
        // Check status code and retry flag
        if (error.response && error.response.status === 401 && config!== undefined && !config._retry) {
            config._retry = true;
            try {
                const res = await refreshTokenRequest(latestRefreshToken, latestAuthDispatch);
                config.headers['Authorization'] = `Bearer ${res.data.accessToken}`;
                return axios(config);
            } catch (err) {
                return Promise.reject(err)
            }
        }
        return Promise.reject(error)
    });

    return axios;
}
