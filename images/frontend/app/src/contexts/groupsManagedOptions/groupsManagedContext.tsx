import { FC } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { GroupsManagedContextProps, IGroupManagedData } from './interfaces'
import { initialState, GroupsManagedReducer } from './groupsManagedReducer';
import { createSectionStore, SectionStoreProvider } from '../../state/createSectionStore';

// Estado de la sección en un almacén Zustand global (antes Context + useReducer): se conserva al cambiar de capa
const useGroupsManagedStore = createSectionStore(GroupsManagedReducer, initialState);

export function useGroupsManagedState() {
	return useGroupsManagedStore();
}

export const GroupsManagedProvider: FC<ChildrenProp> = ({ children }) => (
	<SectionStoreProvider store={useGroupsManagedStore}>{children}</SectionStoreProvider>
);

export function useGroupsManagedDispatch() {
	return useGroupsManagedStore.dispatch;
}

export const useGroupsManagedOptionToShow = (): string => {
	return useGroupsManagedStore((state) => state.groupsManagedOptionToShow);
};

export const useGroupManagedIdToCreateGroupMembers = (): number => {
	return useGroupsManagedStore((state) => state.groupManagedIdToCreateGroupMembers);
};

export const useGroupManagedIdToRemoveAllGroupMembers = (): number => {
	return useGroupsManagedStore((state) => state.groupManagedIdToRemoveAllGroupMembers);
};

export const useGroupManagedRowIndex = (): number => {
	return useGroupsManagedStore((state) => state.groupManagedRowIndex);
};

export const useGroupManagedIdToEdit = (): number => {
	return useGroupsManagedStore((state) => state.groupManagedIdToEdit);
};

export const useGroupManagedInputFormData = (): IGroupManagedData => {
	return useGroupsManagedStore((state) => state.groupManagedInputFormData);
};

export const useGroupManagedBuildingId = (): number => {
	return useGroupsManagedStore((state) => state.groupManagedBuildingId);
};
