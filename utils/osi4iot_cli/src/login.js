import needle from 'needle';


export default async function (osi4iotState) {
	const loginOptions = {
		json: true,
		rejectUnauthorized: false
	};
	const domainName = osi4iotState.platformInfo.DOMAIN_NAME;
	const urlLogin = `https://${domainName}/admin_api/auth/login`;
	const loginData = {
		emailOrLogin: osi4iotState.platformInfo.PLATFORM_ADMIN_USER_NAME,
		password: osi4iotState.platformInfo.PLATFORM_ADMIN_PASSWORD
	}

	const response = await needle('post', urlLogin, loginData, loginOptions)
		.then(res => res.body)
		.catch(err => console.log("Login error: %s", err.message));

	if (response) {
		if (response.accessToken) {
			return response.accessToken;
		} else {
			console.log("Login error: ", response.message)
		}
	} else {
		return "Login error"
	}
}
