import { AuthAction, AuthContextProps } from "./interfaces";

let userName = localStorage.getItem("iot_platform_auth")
	? JSON.parse(localStorage.getItem("iot_platform_auth") as string).userName
	: "";

let accessToken = localStorage.getItem("iot_platform_auth")
	? JSON.parse(localStorage.getItem("iot_platform_auth") as string).accessToken
	: "";

let refreshToken = localStorage.getItem("iot_platform_auth")
	? JSON.parse(localStorage.getItem("iot_platform_auth") as string).refreshToken
	: "";

let expirationDate = localStorage.getItem("iot_platform_auth")
	? JSON.parse(localStorage.getItem("iot_platform_auth") as string).expirationDate
	: "";

export const initialState = {
	userName: "" || userName,
	accessToken: "" || accessToken,
	refreshToken: "" || refreshToken,
	expirationDate: "" || expirationDate,
	userRole: "user",
	numOrganizationManaged: 0,
	numGroupsManaged: 0,
	numAssetsManaged: 0,
	numSensorsManaged: 0,
	numDigitalTwinsManaged: 0,
	numMLModelsManaged: 0,
	loading: false,
	errorMessage: null,
};

export const AuthReducer = (initialState: AuthContextProps, action: AuthAction) => {
	switch (action.type) {
		case "REQUEST_LOGIN":
			return {
				...initialState,
				loading: true,
			};
		case "LOGIN_SUCCESS":
			return {
				...initialState,
				userName: action.payload.userName,
				accessToken: action.payload.accessToken,
				refreshToken: action.payload.refreshToken,
				loading: false,
			};
		case "LOGOUT":
			return {
				...initialState,
				userName: "",
				accessToken: "",
				refreshToken: "",
			};

		case "LOGIN_ERROR":
			return {
				...initialState,
				loading: false,
				errorMessage: action.error,
			};
		case "REFRESH_TOKEN":
			return {
				...initialState,
				accessToken: action.payload.accessToken,
				refreshToken: action.payload.refreshToken,
			};
		case "USER_ROLE":
			return {
				...initialState,
				userRole: action.payload.userRole,
				numOrganizationManaged: action.payload.numOrganizationManaged,
				numGroupsManaged: action.payload.numGroupsManaged,
				numAssetsManaged: action.payload.numAssetsManaged,
				numSensorsManaged: action.payload.numSensorsManaged,
				numDigitalTwinsManaged: action.payload.numDigitalTwinsManaged,
				numMLModelsManaged: action.payload.numMLModelsManaged,
			};

		default:
			throw new Error(`Unhandled action type: ${action.type}`);
	}
};
