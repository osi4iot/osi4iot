import React, { createContext, FC, useContext, useReducer } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { GroupsContextProps } from './interfaces'
import { initialState, GroupsReducer } from './groupsReducer';


const GroupsStateContext = createContext<GroupsContextProps>(initialState);
const GroupsDispatchContext = createContext<any>({});


export function useGroupsDispatch() {
	const context = React.useContext(GroupsDispatchContext);
	if (context === undefined) {
		throw new Error('usePlatformAssitantDispatch must be used within a GroupsProvider');
	}

	return context;
}

export const GroupsProvider: FC<ChildrenProp> = ({ children }) => {
	const [data, groupsDispatch] = useReducer(GroupsReducer, initialState);

	return (
		<GroupsStateContext.Provider value={data}>
			<GroupsDispatchContext.Provider value={groupsDispatch}>
				{children}
			</GroupsDispatchContext.Provider>
		</GroupsStateContext.Provider>
	);
};


export const useGroupsOptionToShow = (): string => {
	const context = useContext(GroupsStateContext);
	if (context === undefined) {
		throw new Error('useGroupsOptionToShow must be used within a GroupsProvider');
	}
	return context.groupsOptionToShow;
}

export const useGroupIdToEdit = (): number => {
	const context = useContext(GroupsStateContext);
	if (context === undefined) {
		throw new Error('useGroupIdToEdit must be used within a GroupsProvider');
	}
	return context.groupIdToEdit;
}
