import React, { createContext, FC, useContext, useReducer } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { PlatformAssistantContextProps } from './interfaces'
import { initialState, PlatformAssitantReducer } from './platformAssistantReducer';


const PlatformAssitantStateContext = createContext<PlatformAssistantContextProps>(initialState);
const PlatformAssitantDispatchContext = createContext<any>({});

export function usePlatformAssitantState() {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('usePlatformAssitantState must be used within a PlatformAssitantProvider');
	}
	return context;
}

export const useIsPlatformAdmin = (): boolean => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useIsPlatformAdmin must be used within a PlatformAssitantProvider');
	}
	return context.userRole === "PlatformAdmin";
}

export const useIsOrgAdmin = (): boolean => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useIsOrgAdmin must be used within a PlatformAssitantProvider');
	}
	return context.userRole === "OrgAdmin";
}

export const useIsGroupAdmin = (): boolean => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useIsGroupAdmin must be used within a PlatformAssitantProvider');
	}
	return context.userRole === "GroupAdmin";
}

export const useUserRole = (): string => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useIsPlatformAdmin must be used within a PlatformAssitantProvider');
	}
	return context.userRole;
}



export function usePlatformAssitantDispatch() {
	const context = React.useContext(PlatformAssitantDispatchContext);
	if (context === undefined) {
		throw new Error('usePlatformAssitantDispatch must be used within a AuthProvider');
	}

	return context;
}

export const PlatformAssitantProvider: FC<ChildrenProp> = ({ children }) => {
	const [user, platformAssistantDispatch] = useReducer(PlatformAssitantReducer, initialState);

	return (
		<PlatformAssitantStateContext.Provider value={user}>
			<PlatformAssitantDispatchContext.Provider value={platformAssistantDispatch}>
				{children}
			</PlatformAssitantDispatchContext.Provider>
		</PlatformAssitantStateContext.Provider>
	);
};

