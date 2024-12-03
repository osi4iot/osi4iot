import axios, { AxiosInstance, AxiosResponse } from 'axios';
import refreshTokenRequest from "./refreshTokenRequest";


export const getAxiosInstance = (refreshToken: string, authDispatch: any): AxiosInstance => {

    axios.interceptors.response.use((response: AxiosResponse<any, any>) => {
        return response
    }, async (error: any) => {
        const config = error.config;
        // Check status code and retry flag
        if (error.response && error.response.status === 401 && config!== undefined && !config._retry) {
            config._retry = true;
            try {
                const res = await refreshTokenRequest(refreshToken, authDispatch);
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