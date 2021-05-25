import React, { createContext, FC, useContext, useReducer } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { GlobalUsersContextProps } from './interfaces'
import { initialState, GlobalUsersReducer } from './globalUsersReducer';


const GlobalUsersStateContext = createContext<GlobalUsersContextProps>(initialState);
const GlobalUsersDispatchContext = createContext<any>({});

export function useGlobalUsersDispatch() {
	const context = React.useContext(GlobalUsersDispatchContext);
	if (context === undefined) {
		throw new Error('usePlatformAssitantDispatch must be used within a GlobalUsersProvider');
	}

	return context;
}

export const GlobalUsersProvider: FC<ChildrenProp> = ({ children }) => {
	const [data,globalUsersDispatch] = useReducer(GlobalUsersReducer, initialState);

	return (
		<GlobalUsersStateContext.Provider value={data}>
			<GlobalUsersDispatchContext.Provider value={globalUsersDispatch}>
				{children}
			</GlobalUsersDispatchContext.Provider>
		</GlobalUsersStateContext.Provider>
	);
};

export const useGlobalUsersOptionToShow = (): string => {
	const context = useContext(GlobalUsersStateContext);
	if (context === undefined) {
		throw new Error('useGlobalUsersOptionToShow must be used within a GlobalUsersProvider');
	}
	return context.globalUsersOptionToShow;
}

export const useGlobalUserIdToEdit = (): number => {
	const context = useContext(GlobalUsersStateContext);
	if (context === undefined) {
		throw new Error('useGlobalUserIdToEdit must be used within a GlobalUsersProvider');
	}
	return context.globalUserIdToEdit;
}

export const useGlobalUserRowIndexToEdit = (): number => {
	const context = useContext(GlobalUsersStateContext);
	if (context === undefined) {
		throw new Error('useGlobalUserRowIndexToEdit must be used within a GlobalUsersProvider');
	}
	return context.globalUserRowIndexToEdit;
}
