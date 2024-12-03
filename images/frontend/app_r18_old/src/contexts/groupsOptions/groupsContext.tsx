import React, { createContext, FC, useContext, useReducer } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { GroupsContextProps, IGroupInputData } from './interfaces'
import { initialState, GroupsReducer } from './groupsReducer';

const GroupsStateContext = createContext<GroupsContextProps>(initialState);
const GroupsDispatchContext = createContext<any>({});

export function useGroupsDispatch() {
	const context = React.useContext(GroupsDispatchContext);
	if (context === undefined) {
		throw new Error('useGroupsDispatch must be used within a GroupsProvider');
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

export const useGroupsPreviousOption = (): string => {
	const context = useContext(GroupsStateContext);
	if (context === undefined) {
		throw new Error('useGroupsPreviousOption must be used within a GroupsProvider');
	}
	return context.groupsPreviousOption;
}

export const useGroupIdToEdit = (): number => {
	const context = useContext(GroupsStateContext);
	if (context === undefined) {
		throw new Error('useGroupIdToEdit must be used within a GroupsProvider');
	}
	return context.groupIdToEdit;
}

export const useGroupRowIndexToEdit = (): number => {
	const context = useContext(GroupsStateContext);
	if (context === undefined) {
		throw new Error('useGroupRowIndexToEdit must be used within a GroupsProvider');
	}
	return context.groupRowIndexToEdit;
}

export const useGroupBuildingId = (): number => {
	const context = useContext(GroupsStateContext);
	if (context === undefined) {
		throw new Error('useGroupBuildingId must be used within a GroupsProvider');
	}
	return context.groupBuildingId;
}

export const useGroupInputData = (): IGroupInputData => {
	const context = useContext(GroupsStateContext);
	if (context === undefined) {
		throw new Error('useGroupEditInputData must be used within a GroupsProvider');
	}
	return context.groupInputFormData;
}

