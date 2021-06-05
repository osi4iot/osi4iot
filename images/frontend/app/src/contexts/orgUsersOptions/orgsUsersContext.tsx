import React, { createContext, FC, useContext, useReducer } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { OrgUsersContextProps } from './interfaces'
import { initialState, OrgUsersReducer } from './orgsUsersReducer';


const OrgUsersStateContext = createContext<OrgUsersContextProps>(initialState);
const OrgUsersDispatchContext = createContext<any>({});

export function usePlatformAssitantState() {
	const context = useContext(OrgUsersStateContext);
	if (context === undefined) {
		throw new Error('usePlatformAssitantState must be used within a OrgUsersProvider');
	}
	return context;
}


export const OrgUsersProvider: FC<ChildrenProp> = ({ children }) => {
	const [data, orgUsersDispatch] = useReducer(OrgUsersReducer, initialState);

	return (
		<OrgUsersStateContext.Provider value={data}>
			<OrgUsersDispatchContext.Provider value={orgUsersDispatch}>
				{children}
			</OrgUsersDispatchContext.Provider>
		</OrgUsersStateContext.Provider>
	);
};

export function useOrgUsersDispatch() {
	const context = React.useContext(OrgUsersDispatchContext);
	if (context === undefined) {
		throw new Error('useOrgsDispatch must be used within a OrgUsersProvider');
	}

	return context;
}


export const useOrgUsersOptionToShow = (): string => {
	const context = useContext(OrgUsersStateContext);
	if (context === undefined) {
		throw new Error('useOrgUsersOptionToShow must be used within a OrgUsersProvider');
	}
	return context.orgUsersOptionToShow;
};

export const useOrgUserOrgIdToEdit = (): number => {
	const context = useContext(OrgUsersStateContext);
	if (context === undefined) {
		throw new Error('useOrgUserOrgIdToEdit must be used within a OrgUsersProvider');
	}
	return context.orgUserOrgIdToEdit;
};

export const useOrgUserUserIdToEdit = (): number => {
	const context = useContext(OrgUsersStateContext);
	if (context === undefined) {
		throw new Error('useOrgUserUserIdToEdit must be used within a OrgUsersProvider');
	}
	return context.orgUserUserIdToEdit;
};

export const useOrgUserRowIndexToEdit = (): number => {
	const context = useContext(OrgUsersStateContext);
	if (context === undefined) {
		throw new Error('useOrgUserRowIndexToEdit must be used within a OrgUsersProvider');
	}
	return context.orgUserRowIndexToEdit;
};
