import { FC } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { GroupMembersContextProps } from './interfaces'
import { initialState, GroupMembersReducer } from './groupMembersReducer';
import { createSectionStore, SectionStoreProvider } from '../../state/createSectionStore';

// Estado de la sección en un almacén Zustand global (antes Context + useReducer): se conserva al cambiar de capa
const useGroupMembersStore = createSectionStore(GroupMembersReducer, initialState);

export function useGroupMembersState() {
	return useGroupMembersStore();
}

export function useGroupMembersDispatch() {
	return useGroupMembersStore.dispatch;
}

export const GroupMembersProvider: FC<ChildrenProp> = ({ children }) => (
	<SectionStoreProvider store={useGroupMembersStore}>{children}</SectionStoreProvider>
);

export const useGroupMembersOptionToShow = (): string => {
	return useGroupMembersStore((state) => state.groupMembersOptionToShow);
};

export const useGroupMemberGroupIdToEdit = (): number => {
	return useGroupMembersStore((state) => state.groupMemberGroupIdToEdit);
};

export const useGroupMemberUserIdToEdit = (): number => {
	return useGroupMembersStore((state) => state.groupMemberUserIdToEdit);
}

export const useGroupMembeRowIndexToEdit = (): number => {
	return useGroupMembersStore((state) => state.groupMemberRowIndexToEdit);
}
