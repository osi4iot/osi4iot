export interface LoggedUser {
    id: string;
    firstName: string;
    surname: string;
    email: string;
}

export interface AuthContextProps {
    accessToken: string;
    refreshToken: string;
    expirationDate: string;
    loading: boolean;
    errorMessage: string | null;
}

export interface ActionPayload {
    accessToken: string;
    refreshToken: string;
}

export interface Action {
    type: string;
    payload: ActionPayload;
    error: string;
}

export interface ChildrenProp {
	children: JSX.Element;
}

export interface LoginData {
	emailOrLogin: string;
	password: string;
};


export interface AuthDispatch {
    (arg0: { type: string; payload?: any; error?: any; }): void;
}
