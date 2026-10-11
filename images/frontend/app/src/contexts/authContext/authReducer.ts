import { AuthAction, AuthContextProps } from "./interfaces";

const getAuthFromStorage = () => {
    const stored = localStorage.getItem("iot_platform_auth");
    return stored ? JSON.parse(stored) : {};
};

const auth = getAuthFromStorage();

export const initialState = {
    userName: auth.userName ?? "",
    accessToken: auth.accessToken ?? "",
    refreshToken: auth.refreshToken ?? "",
    expirationDate: auth.expirationDate ?? "",
    userRole: "user",
    numOrganizationManaged: 0,
    numGroupsManaged: 0,
    numAssetTypesManaged: 0,
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
				numAssetTypesManaged: action.payload.numAssetTypesManaged,
				numAssetsManaged: action.payload.numAssetsManaged,
				numSensorsManaged: action.payload.numSensorsManaged,
				numDigitalTwinsManaged: action.payload.numDigitalTwinsManaged,
				numMLModelsManaged: action.payload.numMLModelsManaged,
			};

		default:
			throw new Error(`Unhandled action type: ${action.type}`);
	}
};
