import axios from "axios";
import { AuthDispatch, LoginData } from "../interfaces/interfaces";
import { getDomainName } from "../tools/tools";

const domainName = getDomainName();

export async function loginUser(dispatch: AuthDispatch, loginPayload: LoginData) {

	try {
		dispatch({ type: 'LOGIN_ERROR', error: null });
		dispatch({ type: 'REQUEST_LOGIN' });
        const url = `https://${domainName}/admin_api/auth/login`;
        const resp = await axios.post(url, loginPayload);
        const data = resp.data;

		if (data.accessToken) {
			dispatch({ type: 'LOGIN_SUCCESS', payload: data });
			localStorage.setItem('loggedUser', JSON.stringify(data));
			return data;
		}

		dispatch({ type: 'LOGIN_ERROR', error: data.errors[0] });
		console.log(data.errors[0]);
		return;
	} catch (error) {
		const message = error.response.data.message;
		dispatch({ type: 'LOGIN_ERROR', error: message });
	}
}

export async function logout(dispatch: AuthDispatch) {
	dispatch({ type: 'LOGOUT' });
	localStorage.removeItem('currentUser');
	localStorage.removeItem('token');
}
