import React, { createContext, FC, useContext, useReducer } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { GroupsManagedContextProps } from './interfaces'
import { initialState, GroupsManagedReducer } from './groupsManagedReducer';


const GroupsManagedStateContext = createContext<GroupsManagedContextProps>(initialState);
const GroupsManagedDispatchContext = createContext<any>({});

export function useGroupsManagedState() {
	const context = useContext(GroupsManagedStateContext);
	if (context === undefined) {
		throw new Error('useOrgsManagedState must be used within a GroupsManagedProvider');
	}
	return context;
}


export const GroupsManagedProvider: FC<ChildrenProp> = ({ children }) => {
	const [data, groupsManagedDispatch] = useReducer(GroupsManagedReducer, initialState);

	return (
		<GroupsManagedStateContext.Provider value={data}>
			<GroupsManagedDispatchContext.Provider value={groupsManagedDispatch}>
				{children}
			</GroupsManagedDispatchContext.Provider>
		</GroupsManagedStateContext.Provider>
	);
};

export function useGroupsManagedDispatch() {
	const context = React.useContext(GroupsManagedDispatchContext);
	if (context === undefined) {
		throw new Error('useGroupsManagedDispatch must be used within a GroupsManagedProvider');
	}

	return context;
}

export const useGroupsManagedOptionToShow = (): string => {
	const context = useContext(GroupsManagedStateContext);
	if (context === undefined) {
		throw new Error('useGroupsManagedOptionToShow must be used within a GroupsManagedProvider');
	}
	return context.groupsManagedOptionToShow;
};

export const useGroupManagedIdToCreateGroupMembers = (): number => {
	const context = useContext(GroupsManagedStateContext);
	if (context === undefined) {
		throw new Error('useGroupManagedIdToCreateGroupMembers must be used within a GroupsManagedProvider');
	}
	return context.groupManagedIdToCreateGroupMembers;
};

export const useGroupManagedIdToRemoveAllGroupMembers = (): number => {
	const context = useContext(GroupsManagedStateContext);
	if (context === undefined) {
		throw new Error('useGroupManagedIdToRemoveAllGroupMembers must be used within a GroupsManagedProvider');
	}
	return context.groupManagedIdToRemoveAllGroupMembers;
};

export const useGroupManagedRowIndex = (): number => {
	const context = useContext(GroupsManagedStateContext);
	if (context === undefined) {
		throw new Error('useGroupManagedRowIndex must be used within a GroupsManagedProvider');
	}
	return context.groupManagedRowIndex;
};
