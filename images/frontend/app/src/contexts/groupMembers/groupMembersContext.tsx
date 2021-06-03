import React, { createContext, FC, useContext, useReducer } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { GroupMembersContextProps } from './interfaces'
import { initialState, GroupMembersReducer } from './groupMembersReducer';


const GroupMembersStateContext = createContext<GroupMembersContextProps>(initialState);
const GroupMembersDispatchContext = createContext<any>({});

export function usePlatformAssitantState() {
	const context = useContext(GroupMembersStateContext);
	if (context === undefined) {
		throw new Error('usePlatformAssitantState must be used within a PlatformAssitantProvider');
	}
	return context;
}


export function useGroupMembersDispatch() {
	const context = React.useContext(GroupMembersDispatchContext);
	if (context === undefined) {
		throw new Error('useGroupMembersDispatch must be used within a GroupMembersProvider');
	}

	return context;
}

export const GroupMembersProvider: FC<ChildrenProp> = ({ children }) => {
	const [user, groupMemberDispatch] = useReducer(GroupMembersReducer, initialState);

	return (
		<GroupMembersStateContext.Provider value={user}>
			<GroupMembersDispatchContext.Provider value={groupMemberDispatch}>
				{children}
			</GroupMembersDispatchContext.Provider>
		</GroupMembersStateContext.Provider>
	);
};

export const useGroupMembersOptionToShow = (): string => {
	const context = useContext(GroupMembersStateContext);
	if (context === undefined) {
		throw new Error('useGroupMembersToShow must be used within a GroupMembersProvider');
	}
	return context.groupMembersOptionToShow;
};

export const useGroupMemberGroupIdToEdit = (): number => {
	const context = useContext(GroupMembersStateContext);
	if (context === undefined) {
		throw new Error('useGroupMemberGroupIdToEdit must be used within a GroupMembersProvider');
	}
	return context.groupMemberGroupIdToEdit;
};

export const useGroupMemberUserIdToEdit = (): number => {
	const context = useContext(GroupMembersStateContext);
	if (context === undefined) {
		throw new Error('useGroupMemberUserIdToEdit must be used within a GroupMembersProvider');
	}
	return context.groupMemberUserIdToEdit;
}

export const useGroupMembeRowIndexToEdit = (): number => {
	const context = useContext(GroupMembersStateContext);
	if (context === undefined) {
		throw new Error('useGroupMembeRowIndexToEdit must be used within a GroupMembersProvider');
	}
	return context.groupMemberRowIndexToEdit;
}
