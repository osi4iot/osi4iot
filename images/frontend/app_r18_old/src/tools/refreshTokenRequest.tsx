
import { axiosPublic } from "./axiosPublic";
import { getDomainName, getProtocol } from './tools';

const refreshTokenRequest = async (refreshToken: string, authDispatch: any) => {
    const domainName = getDomainName();
    const protocol = getProtocol();

    const udpateTokenUrl = `${protocol}://${domainName}/admin_api/auth/update_token`;
    const config = {
        headers: {
            Authorization: "Bearer " + refreshToken,
        }
    };
    const response = await axiosPublic.post(udpateTokenUrl, null, config);
    if (response.data.accessToken) {
        localStorage.setItem('iot_platform_auth', JSON.stringify(response.data));
        authDispatch({ type: 'REFRESH_TOKEN', payload: response.data });
    }
    return response;
}


export default refreshTokenRequest;