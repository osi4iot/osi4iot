import axios, { AxiosInstance, AxiosResponse } from 'axios';
import refreshTokenRequest from "./refreshTokenRequest";

// El interceptor que renueva el token se registra una sola vez (antes se añadía uno nuevo en cada
// petición y se iban acumulando). Usa siempre el refreshToken y el authDispatch más recientes.
let latestRefreshToken = "";
let latestAuthDispatch: any = null;
let interceptorRegistered = false;
// La renovación en curso: las peticiones que reciben un 401 a la vez esperan a la misma renovación.
// Antes cada una pedía la suya con el mismo refresh token; si la primera lo cambiaba (cerca de su
// caducidad, el servidor emite uno nuevo y borra el anterior), las demás recibían "The refresh token
// supplied does not exist" y la sesión se cerraba.
let refreshing: Promise<any> | null = null;
// refresh tokens que el servidor ya ha sustituido: un componente que aún no se ha vuelto a pintar puede
// pasar uno de ellos, y no debe volver a usarse
const replacedRefreshTokens = new Set<string>();

const renewToken = () => {
    if (!refreshing) {
        const used = latestRefreshToken;
        refreshing = refreshTokenRequest(used, latestAuthDispatch)
            .then((res) => {
                // el refresh token que vale desde ahora, aunque el estado de React aún no se haya actualizado
                const next = res.data?.refreshToken;
                if (next && next !== used) {
                    replacedRefreshTokens.add(used);
                    latestRefreshToken = next;
                }
                return res;
            })
            .finally(() => {
                refreshing = null;
            });
    }
    return refreshing;
};

export const getAxiosInstance = (refreshToken: string, authDispatch: any): AxiosInstance => {
    if (!refreshing && !replacedRefreshTokens.has(refreshToken)) latestRefreshToken = refreshToken;
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
                const res = await renewToken();
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
