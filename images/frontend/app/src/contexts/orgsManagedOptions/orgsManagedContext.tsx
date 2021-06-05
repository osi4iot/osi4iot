import React, { createContext, FC, useContext, useReducer } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { OrgsManagedContextProps } from './interfaces'
import { initialState, OrgsManagedReducer } from './orgsManagedReducer';


const OrgsManagedStateContext = createContext<OrgsManagedContextProps>(initialState);
const OrgsManagedDispatchContext = createContext<any>({});

export function useOrgsManagedState() {
	const context = useContext(OrgsManagedStateContext);
	if (context === undefined) {
		throw new Error('useOrgsManagedState must be used within a OrgsManagedProvider');
	}
	return context;
}


export const OrgsManagedProvider: FC<ChildrenProp> = ({ children }) => {
	const [data, orgsManagedDispatch] = useReducer(OrgsManagedReducer, initialState);

	return (
		<OrgsManagedStateContext.Provider value={data}>
			<OrgsManagedDispatchContext.Provider value={orgsManagedDispatch}>
				{children}
			</OrgsManagedDispatchContext.Provider>
		</OrgsManagedStateContext.Provider>
	);
};

export function useOrgsManagedDispatch() {
	const context = React.useContext(OrgsManagedDispatchContext);
	if (context === undefined) {
		throw new Error('useOrgsManagedDispatch must be used within a OrgsManagedProvider');
	}

	return context;
}


export const useOrgsManagedOptionToShow = (): string => {
	const context = useContext(OrgsManagedStateContext);
	if (context === undefined) {
		throw new Error('useOrgsManagedOptionToShow must be used within a OrgsManagedProvider');
	}
	return context.orgsManagedOptionToShow;
};

export const useOrgManagedIdToCreateOrgUsers = (): number => {
	const context = useContext(OrgsManagedStateContext);
	if (context === undefined) {
		throw new Error('useOrgManagedIdToCreateOrgUsers must be used within a OrgsManagedProvider');
	}
	return context.orgManagedIdToCreateOrgUsers;
};

export const useOrgManagedIdToRemoveAllOrgUsers = (): number => {
	const context = useContext(OrgsManagedStateContext);
	if (context === undefined) {
		throw new Error('useOrgManagedIdToRemoveAllOrgUsers must be used within a OrgsManagedProvider');
	}
	return context.orgManagedIdToRemoveAllOrgUsers;
};

export const useOrgManagedRowIndex = (): number => {
	const context = useContext(OrgsManagedStateContext);
	if (context === undefined) {
		throw new Error('useOrgManagedRowIndex must be used within a OrgsManagedProvider');
	}
	return context.orgManagedRowIndex;
};
