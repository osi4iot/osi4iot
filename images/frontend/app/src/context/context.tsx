import React, { createContext, FC, useContext, useReducer } from 'react';
import { AuthContextProps, ChildrenProp } from '../interfaces/interfaces';
import { initialState, AuthReducer } from './reducer';


const AuthStateContext = createContext<AuthContextProps>(initialState);
const AuthDispatchContext = createContext<any>({});

export function useAuthState() {
	const context = useContext(AuthStateContext);
	if (context === undefined) {
		throw new Error('useAuthState must be used within a AuthProvider');
	}
	return context;
}

export const useIsUserAuth = () => {
	const { accessToken } = useContext(AuthStateContext);
	return accessToken !== "";
}

export const useLoggedUserLogin = () => {
	const { userName } = useContext(AuthStateContext);
	return userName;
}



export function useAuthDispatch() {
	const context = React.useContext(AuthDispatchContext);
	if (context === undefined) {
		throw new Error('useAuthDispatch must be used within a AuthProvider');
	}

	return context;
}

export const AuthProvider: FC<ChildrenProp> = ({ children }) => {
	const [user, dispatch] = useReducer(AuthReducer, initialState);

	return (
		<AuthStateContext.Provider value={user}>
			<AuthDispatchContext.Provider value={dispatch}>
				{children}
			</AuthDispatchContext.Provider>
		</AuthStateContext.Provider>
	);
};
