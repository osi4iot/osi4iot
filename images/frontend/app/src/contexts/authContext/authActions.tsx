import axios from "axios";
import { AuthDispatch,  LoginData } from "./interfaces";
import { getDomainName } from "../../tools/tools";

const domainName = getDomainName();

export async function loginUser(authDispatch: AuthDispatch, loginPayload: LoginData) {

	try {
		authDispatch({ type: 'LOGIN_ERROR', error: null });
		authDispatch({ type: 'REQUEST_LOGIN' });
        const url = `https://${domainName}/admin_api/auth/login`;
        const resp = await axios.post(url, loginPayload);
		const data = resp.data;

		if (data.accessToken) {
			authDispatch({ type: 'LOGIN_SUCCESS', payload: data });
			localStorage.setItem('iot_platform_auth', JSON.stringify(data));
			return data;
		}

		authDispatch({ type: 'LOGIN_ERROR', error: data.errors[0] });
		console.log(data.errors[0]);
		return;
	} catch (error: any) {
		const message = error.response.data.message;
		authDispatch({ type: 'LOGIN_ERROR', error: message });
	}
}

export function logout(authDispatch: AuthDispatch) {
	authDispatch({ type: 'LOGOUT' });
	localStorage.removeItem('iot_platform_auth');
}
