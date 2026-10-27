import { FC } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { OrgUsersContextProps } from './interfaces'
import { initialState, OrgUsersReducer } from './orgsUsersReducer';
import { createSectionStore, SectionStoreProvider } from '../../state/createSectionStore';

// Estado de la sección en un almacén Zustand global (antes Context + useReducer): se conserva al cambiar de capa
const useOrgUsersStore = createSectionStore(OrgUsersReducer, initialState);

export function useOrgUsersState() {
	return useOrgUsersStore();
}

export const OrgUsersProvider: FC<ChildrenProp> = ({ children }) => (
	<SectionStoreProvider store={useOrgUsersStore}>{children}</SectionStoreProvider>
);

export function useOrgUsersDispatch() {
	return useOrgUsersStore.dispatch;
}

export const useOrgUsersOptionToShow = (): string => {
	return useOrgUsersStore((state) => state.orgUsersOptionToShow);
};

export const useOrgUserOrgIdToEdit = (): number => {
	return useOrgUsersStore((state) => state.orgUserOrgIdToEdit);
};

export const useOrgUserUserIdToEdit = (): number => {
	return useOrgUsersStore((state) => state.orgUserUserIdToEdit);
};

export const useOrgUserRowIndexToEdit = (): number => {
	return useOrgUsersStore((state) => state.orgUserRowIndexToEdit);
};
