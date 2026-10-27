import { FC } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { GroupsContextProps, IGroupInputData } from './interfaces'
import { initialState, GroupsReducer } from './groupsReducer';
import { createSectionStore, SectionStoreProvider } from '../../state/createSectionStore';

// Estado de la sección en un almacén Zustand global (antes Context + useReducer): se conserva al cambiar de capa
const useGroupsStore = createSectionStore(GroupsReducer, initialState);

export function useGroupsDispatch() {
	return useGroupsStore.dispatch;
}

export const GroupsProvider: FC<ChildrenProp> = ({ children }) => (
	<SectionStoreProvider store={useGroupsStore}>{children}</SectionStoreProvider>
);

export const useGroupsOptionToShow = (): string => {
	return useGroupsStore((state) => state.groupsOptionToShow);
}

export const useGroupsPreviousOption = (): string => {
	return useGroupsStore((state) => state.groupsPreviousOption);
}

export const useGroupIdToEdit = (): number => {
	return useGroupsStore((state) => state.groupIdToEdit);
}

export const useGroupRowIndexToEdit = (): number => {
	return useGroupsStore((state) => state.groupRowIndexToEdit);
}

export const useGroupBuildingId = (): number => {
	return useGroupsStore((state) => state.groupBuildingId);
}

export const useGroupInputData = (): IGroupInputData => {
	return useGroupsStore((state) => state.groupInputFormData);
}
