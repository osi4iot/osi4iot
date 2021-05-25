import React, { createContext, FC, useContext, useReducer } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { OrgsContextProps } from './interfaces'
import { initialState, OrgsReducer } from './orgsReducer';


const OrgsStateContext = createContext<OrgsContextProps>(initialState);
const OrgsDispatchContext = createContext<any>({});


export const OrgsProvider: FC<ChildrenProp> = ({ children }) => {
	const [data, orgsDispatch] = useReducer(OrgsReducer, initialState);

	return (
		<OrgsStateContext.Provider value={data}>
			<OrgsDispatchContext.Provider value={orgsDispatch}>
				{children}
			</OrgsDispatchContext.Provider>
		</OrgsStateContext.Provider>
	);
};

export function useOrgsDispatch() {
	const context = React.useContext(OrgsDispatchContext);
	if (context === undefined) {
		throw new Error('useOrgsDispatch must be used within a OrgsProvider');
	}

	return context;
}

export const useOrgsOptionToShow = (): string => {
	const context = useContext(OrgsStateContext);
	if (context === undefined) {
		throw new Error('useOrgsOptionToShow must be used within a OrgsProvider');
	}
	return context.orgsOptionToShow;
}

export const useOrgIdToEdit = (): number => {
	const context = useContext(OrgsStateContext);
	if (context === undefined) {
		throw new Error('useOrgIdToEdit must be used within a OrgsProvider');
	}
	return context.orgIdToEdit;
}

export const useOrgRowIndexToEdit = (): number => {
	const context = useContext(OrgsStateContext);
	if (context === undefined) {
		throw new Error('useOrgRowIndexToEdit must be used within a OrgsProvider');
	}
	return context.orgRowIndexToEdit;
}

