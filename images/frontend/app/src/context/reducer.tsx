import { Action, AuthContextProps } from "../interfaces/interfaces";

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
	accessToken: "" || accessToken,
    refreshToken: "" || refreshToken,
    expirationDate: "" || expirationDate,
	loading: false,
	errorMessage: null,
};

export const AuthReducer = (initialState: AuthContextProps, action: Action) => {
	switch (action.type) {
		case "REQUEST_LOGIN":
			return {
				...initialState,
				loading: true,
			};
		case "LOGIN_SUCCESS":
			return {
				...initialState,
				accessToken: action.payload.accessToken,
				refreshToken: action.payload.refreshToken,
				loading: false,
			};
		case "LOGOUT":
			return {
				...initialState,
				accessToken: "",
				refreshToken: "",
			};

		case "LOGIN_ERROR":
			return {
				...initialState,
				loading: false,
				errorMessage: action.error,
			};

		default:
			throw new Error(`Unhandled action type: ${action.type}`);
	}
};
